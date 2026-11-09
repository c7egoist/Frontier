//============================================================================================================================================
//                                                     CANDYVILLAGESTRUCTURE.JS
//============================================================================================================================================
// 🍬 Candy Village · Sugar Siege ("candy"):
//    • 5-District Alpine Gingerbread Village & Sunken 2.5D Lagoon/Canal Basin (X ∈ [-225..+225], Y ∈ [-80..+80]):
//      1. Waffle Square & Gingerbread Cottages (X = -205 .. -132 m)
//      2. The 2.5D Fizzy Berry-Soda Lagoon & Twin Wafer Arch Bridges (X = -132 .. -42 m)
//      3. Gummy-Worm Crossroads, Bouncy Gummy Pinball Hairpins & Shatterable Sugar-Glass Shortcuts (X = -42 .. +62 m)
//      4. Frosting Siege Ridge — Gummy-Bear Catapults & Old-School Naval Candy Cannons (X = +62 .. +142 m)
//      5. Citadel Soda Moat & The Grand Gingerbread Sweet-Gate (X = +142 .. +196 m, Breach Goal X = +186 m)
//    • Every 3D village building, bridge, gummy-bear worm, catapult, old-school cannon & projectile is a strictly
//      closed watertight 2-manifold (Boundary === 0, NonManifold === 0).

import { CourseMaterial } from "./MaterialSpecification.js";
import { EmitQuad } from "./CourseStructure.js";
import { SurfaceCategory } from "./RampSurfaceProjection.js";

//------------------------------------------------------------------------------------------------------------------------
//                           CANDY VILLAGE BOUNDS, BATHYMETRY & 3D TERRAIN HEIGHTFIELD
//------------------------------------------------------------------------------------------------------------------------

export const CandyBounds = Object.freeze({
    Minimum: [-225.0, -76.0],
    Maximum: [ 225.0,  76.0]
});

export const CandyWaterGridSpec = Object.freeze({
    XMin: -142.0,
    XMax:  174.0,
    YMin:  -44.0,
    YMax:   44.0,
    NX:     96,
    NY:     48,
    RestSurfaceZ: 1.72 // Resting 2.5D fluid free-surface elevation η₀ [m]
});

export const CandyWaferBridges = Object.freeze([
    { Key: "candy_bridge_south", CX: -86.0, CY: -21.5, HalfRun: 34.0, HalfWidth: 4.6, DeckLift: 1.05 },
    { Key: "candy_bridge_north", CX: -86.0, CY:  21.5, HalfRun: 34.0, HalfWidth: 4.6, DeckLift: 1.05 },
    { Key: "candy_moat_causeway",CX: 147.0, CY:   0.0, HalfRun: 17.0, HalfWidth: 5.5, DeckLift: 0.62 }
]);

// Elastic Gummy Pinball Bumpers placed along village S-curves (high restitution bounce + zero damage!)
export const CandyGummyBumpers = Object.freeze([
    { Pos: [-134.0,   0.0], Radius: 2.35, Mat: CourseMaterial.GummyCherry },
    { Pos: [ -34.0, -14.5], Radius: 2.35, Mat: CourseMaterial.GummyLime   },
    { Pos: [ -34.0,  14.5], Radius: 2.35, Mat: CourseMaterial.GummyOrange },
    { Pos: [   4.0,   0.0], Radius: 2.50, Mat: CourseMaterial.GummyBerry  },
    { Pos: [  52.0, -15.5], Radius: 2.35, Mat: CourseMaterial.GummyCherry },
    { Pos: [  52.0,  15.5], Radius: 2.35, Mat: CourseMaterial.GummyLime   },
    { Pos: [ 108.0,  -9.5], Radius: 2.35, Mat: CourseMaterial.GummyOrange },
    { Pos: [ 108.0,   9.5], Radius: 2.35, Mat: CourseMaterial.GummyBerry  }
]);

// 4 Giant Gummy-Bear Worm Patrol Centerlines (looping across the 2.5D Lagoon, Canal & Crossroads!)
export const CandyWormPatrols = Object.freeze([
    { Center: [-86.0,   0.0], RadiusX: 18.0, RadiusY: 14.5, Speed: 0.72, Phase: 0.0  }, // Lagoon Ford Guardian Worm!
    { Center: [-14.0,   4.0], RadiusX: 16.0, RadiusY: 18.0, Speed: 0.66, Phase: 1.65 }, // Village Crossroads S-Worm!
    { Center: [ 32.0,  -3.0], RadiusX: 17.0, RadiusY: 16.5, Speed: 0.76, Phase: 3.10 }, // Syrup Canal Breaching Worm!
    { Center: [147.0,   2.0], RadiusX: 10.5, RadiusY: 19.0, Speed: 0.80, Phase: 4.70 }  // Citadel Moat Guardian Worm!
]);

// 5 Elevated Gummy-Bear Siege Catapults (hurling Flaming Gummy Balls that bounce & leave sticky molten syrup puddles!)
export const CandyCatapultSites = Object.freeze([
    { Pos: [ -54.0, -37.0], Yaw:  1.85 },
    { Pos: [ -12.0,  38.0], Yaw: -1.85 },
    { Pos: [  48.0, -37.5], Yaw:  1.92 },
    { Pos: [  96.0,  37.5], Yaw: -2.05 },
    { Pos: [ 168.0, -29.0], Yaw:  2.45 }
]);

// 6 Old-School Wheeled Brass-&-Licorice Candy Cannons (firing fast skipping Jawbreaker Cannonballs!)
export const CandyCannonSites = Object.freeze([
    { Pos: [ -42.0,  33.5], Yaw: -2.20 },
    { Pos: [  18.0, -33.5], Yaw:  2.15 },
    { Pos: [  74.0,  33.0], Yaw: -2.25 },
    { Pos: [ 118.0, -33.0], Yaw:  2.30 },
    { Pos: [ 178.0,  19.5], Yaw: -2.75 },
    { Pos: [ 178.0, -19.5], Yaw:  2.75 }
]);

function SmoothStep01(T)
{
    const C = Math.max(0.0, Math.min(1.0, T));
    return C * C * (3.0 - 2.0 * C);
}

// 📝 Returns sunken 2.5D river/lagoon/moat basin carve depth [0 .. 1.78 m] at (X, Y):
export function QueryCandyBasinCarve(X, Y)
{
    let Carve = 0.0;

    // ① Main Fizzy Berry-Soda Lagoon (X ∈ [-124 .. -48 m], Y ∈ [-36 .. +36 m]):
    //    Deep channels at |Y| ∈ [8..26 m] (under Wafer Bridges), plus a shallower wadeable Central Cobble Ford near Y = 0!
    if (X > -128.0 && X < -44.0 && Math.abs(Y) < 38.0)
    {
        const UX = SmoothStep01((X + 126.0) / 14.0) * SmoothStep01((-46.0 - X) / 14.0);
        const UY = SmoothStep01((36.5 - Math.abs(Y)) / 8.0);
        // Central shallow ford bar around Y = 0 lifts bed by +0.52 m so daring drivers can splash straight across!
        const FordBar = 0.52 * Math.exp(-(Y * Y) / (2.0 * 6.5 * 6.5));
        Carve = Math.max(Carve, (1.68 - FordBar) * UX * UY);
    }

    // ② Winding Mid-Village Soda-Syrup Canal (X ∈ [12 .. 52 m], curving diagonally across the lane!)
    if (X > 6.0 && X < 58.0 && Math.abs(Y) < 38.0)
    {
        const CanalCenterX = 32.0 + 7.5 * Math.sin(Y * 0.085);
        const DistX = Math.abs(X - CanalCenterX);
        if (DistX < 17.5)
        {
            const Bank = 0.5 * (1.0 + Math.cos(Math.PI * DistX / 17.5));
            const UY   = SmoothStep01((36.5 - Math.abs(Y)) / 7.0);
            // Two wadeable stepping bars at Y = ±14 m
            const Ford = 0.42 * (Math.exp(-((Y - 14.0) ** 2) / 32.0) + Math.exp(-((Y + 14.0) ** 2) / 32.0));
            Carve = Math.max(Carve, Math.max(0.0, 1.46 * Bank - Ford) * UY);
        }
    }

    // ③ Grand Citadel Soda Moat (X ∈ [133 .. 161 m], Y ∈ [-36 .. +36 m]) before the Sweet-Gate!
    if (X > 129.0 && X < 165.0 && Math.abs(Y) < 38.0)
    {
        const DistX = Math.abs(X - 147.0);
        if (DistX < 15.0)
        {
            const Bank = 0.5 * (1.0 + Math.cos(Math.PI * DistX / 15.0));
            const UY   = SmoothStep01((36.5 - Math.abs(Y)) / 7.0);
            Carve = Math.max(Carve, 1.58 * Bank * UY);
        }
    }

    return Carve;
}

export function QueryCandyTerrainHeight(X, Y)
{
    // ① Gentle Alpine Candy Village Terrace (2.22 m at Waffle Square -> 2.72 m at Citadel Plaza; always >= 0.14 m!)
    const GentleRise = 0.52 * SmoothStep01((X + 185.0) / 360.0);
    let H = 2.22 + GentleRise;

    // ② Sunken 2.5D Lagoon, Mid-Village Canal & Citadel Moat Riverbeds!
    const Carve = QueryCandyBasinCarve(X, Y);
    H -= Carve;

    // ③ Soft Rolling Sugar-Frosting Hills along North & South Village Flanks (|Y| > 30 m -> rises +4.6 m!)
    const AbsY = Math.abs(Y);
    if (AbsY > 29.5 && X < 192.0)
    {
        const HillT = SmoothStep01((AbsY - 29.5) / 20.0);
        H += (4.55 + 0.85 * Math.sin(X * 0.05 + Y * 0.04)) * HillT;
    }

    // ④ Gentle Village Rolling Cobble Crown (tapered flat in basins and at Citadel Gate!)
    const DryMask  = SmoothStep01(0.35 - Carve);
    const GateFlat = 1.0 - 0.90 * SmoothStep01((X - 172.0) / 14.0);
    H += DryMask * GateFlat * (0.14 * Math.sin(X * 0.06 + Y * 0.07) + 0.08 * Math.cos(X * 0.12 - Y * 0.09));

    return Math.max(0.14, H);
}

//------------------------------------------------------------------------------------------------------------------------
//                  WATERTIGHT 2-MANIFOLD GEOMETRIC PRIMITIVES (ZERO SHARED/NON-MANIFOLD EDGES!)
//------------------------------------------------------------------------------------------------------------------------

function EmitBox(Out, X0, Y0, Z0, X1, Y1, Z1, Mat)
{
    EmitQuad(Out, [X0, Y0, Z1], [X1, Y0, Z1], [X1, Y1, Z1], [X0, Y1, Z1], Mat);
    EmitQuad(Out, [X0, Y1, Z0], [X1, Y1, Z0], [X1, Y0, Z0], [X0, Y0, Z0], Mat);
    EmitQuad(Out, [X1, Y0, Z0], [X1, Y1, Z0], [X1, Y1, Z1], [X1, Y0, Z1], Mat);
    EmitQuad(Out, [X0, Y1, Z0], [X0, Y0, Z0], [X0, Y0, Z1], [X0, Y1, Z1], Mat);
    EmitQuad(Out, [X0, Y1, Z1], [X1, Y1, Z1], [X1, Y1, Z0], [X0, Y1, Z0], Mat);
    EmitQuad(Out, [X0, Y0, Z0], [X1, Y0, Z0], [X1, Y0, Z1], [X0, Y0, Z1], Mat);
}

function EmitTranslatedBox(CX, CY, BottomZ, SX, SY, SZ, Mat)
{
    const Out = [];
    EmitBox(Out, CX - SX * 0.5, CY - SY * 0.5, BottomZ, CX + SX * 0.5, CY + SY * 0.5, BottomZ + SZ, Mat);
    return Out;
}

function EmitTruncatedPyramid(CX, CY, BottomZ, BX, BY, TX, TY, Height, SideMat, TopMat = SideMat)
{
    const Out = [];
    const B0 = BX * 0.5, B1 = BY * 0.5, T0 = TX * 0.5, T1 = TY * 0.5;
    const Z0 = BottomZ, Z1 = BottomZ + Height;
    const P00 = [CX - B0, CY - B1, Z0], P10 = [CX + B0, CY - B1, Z0];
    const P11 = [CX + B0, CY + B1, Z0], P01 = [CX - B0, CY + B1, Z0];
    const Q00 = [CX - T0, CY - T1, Z1], Q10 = [CX + T0, CY - T1, Z1];
    const Q11 = [CX + T0, CY + T1, Z1], Q01 = [CX - T0, CY + T1, Z1];
    EmitQuad(Out, P01, P11, P10, P00, SideMat);
    EmitQuad(Out, Q00, Q10, Q11, Q01, TopMat);
    EmitQuad(Out, P10, P11, Q11, Q10, SideMat);
    EmitQuad(Out, P01, P00, Q00, Q01, SideMat);
    EmitQuad(Out, P01, Q01, Q11, P11, SideMat);
    EmitQuad(Out, P00, P10, Q10, Q00, SideMat);
    return Out;
}

function EmitTaperedCylinder(CX, CY, CZ, Axis, R0, R1, Length, Sides, SideMat, Cap0Mat = SideMat, Cap1Mat = SideMat)
{
    const Out = [];
    const Half = Length * 0.5;
    const MapPt = (Along, U, V) =>
    {
        if (Axis === "X") return [CX + Along, CY + U, CZ + V];
        if (Axis === "Y") return [CX + V, CY + Along, CZ + U];
        return [CX + U, CY + V, CZ + Along];
    };
    const Ring0 = [], Ring1 = [];
    for (let I = 0; I < Sides; ++I)
    {
        const A = (I / Sides) * Math.PI * 2.0;
        const C = Math.cos(A), S = Math.sin(A);
        Ring0.push(MapPt(-Half, C * R0, S * R0));
        Ring1.push(MapPt( Half, C * R1, S * R1));
    }
    const C0 = MapPt(-Half, 0.0, 0.0), C1 = MapPt(Half, 0.0, 0.0);
    for (let I = 0; I < Sides; ++I)
    {
        const J = (I + 1) % Sides;
        EmitQuad(Out, Ring0[I], Ring0[J], Ring1[J], Ring1[I], SideMat);
        Out.push({ Family: Cap0Mat, Corners: [C0, Ring0[J], Ring0[I]] });
        Out.push({ Family: Cap1Mat, Corners: [C1, Ring1[I], Ring1[J]] });
    }
    return Out;
}

function EmitEllipsoid(CX, CY, CZ, RX, RY, RZ, Stacks, Slices, MatA, MatB = MatA)
{
    const Out = [];
    const Pt = (St, Sl) =>
    {
        const Phi   = -0.5 * Math.PI + (St / Stacks) * Math.PI;
        const Theta = (Sl / Slices) * Math.PI * 2.0;
        const CP = Math.cos(Phi), SP = Math.sin(Phi);
        return [CX + RX * CP * Math.cos(Theta), CY + RY * CP * Math.sin(Theta), CZ + RZ * SP];
    };
    const South = [CX, CY, CZ - RZ];
    const North = [CX, CY, CZ + RZ];
    for (let Sl = 0; Sl < Slices; ++Sl)
    {
        const NSl = (Sl + 1) % Slices;
        const Mat = (Sl & 1) === 0 ? MatA : MatB;
        Out.push({ Family: Mat, Corners: [South, Pt(1, NSl), Pt(1, Sl)] });
        for (let St = 1; St < Stacks - 1; ++St)
            EmitQuad(Out, Pt(St, Sl), Pt(St, NSl), Pt(St + 1, NSl), Pt(St + 1, Sl), Mat);
        Out.push({ Family: Mat, Corners: [North, Pt(Stacks - 1, Sl), Pt(Stacks - 1, NSl)] });
    }
    return Out;
}

//------------------------------------------------------------------------------------------------------------------------
//                      CANDY VILLAGE ARCHITECTURE, BRIDGES & PINBALL CUSHIONS (2-MANIFOLD)
//------------------------------------------------------------------------------------------------------------------------

// 📝 Alpine Gingerbread Cottage: baked gingerbread walls, royal-icing pitched roof, candy-cane corner pillars & warm bakery windows!
export function EmitCandyCottageFacets()
{
    const Out = [];
    // Wafer plinth + Gingerbread walls
    Out.push(...EmitTranslatedBox(0.0, 0.0, -0.45, 7.8, 6.6, 0.45, CourseMaterial.WaferCrisp));
    Out.push(...EmitTranslatedBox(0.0, 0.0,  0.03, 7.2, 6.0, 4.10, CourseMaterial.Gingerbread));
    // Pitched Whipped-Frosting Roof + Gingerbread Chimney + Gummy Roof Gumdrops!
    Out.push(...EmitTruncatedPyramid(0.0, 0.0, 4.16, 8.2, 7.0, 7.6, 0.55, 2.65, CourseMaterial.FrostingCream, CourseMaterial.FrostingCream));
    Out.push(...EmitTranslatedBox(2.1, -1.5, 5.25, 0.95, 0.95, 2.05, CourseMaterial.Gingerbread));
    Out.push(...EmitTranslatedBox(2.1, -1.5, 7.33, 1.15, 1.15, 0.24, CourseMaterial.FrostingCream));
    const GumMats = [CourseMaterial.GummyCherry, CourseMaterial.GummyLime, CourseMaterial.GummyOrange, CourseMaterial.GummyBerry];
    for (let I = 0; I < 4; ++I)
        Out.push(...EmitEllipsoid(-2.7 + I * 1.8, 0.0, 7.08, 0.34, 0.34, 0.28, 5, 8, GumMats[I]));
    // 4 Peppermint-Striped Corner Columns
    for (const SX of [-3.68, 3.68])
        for (const SY of [-3.08, 3.08])
            for (let Band = 0; Band < 4; ++Band)
                Out.push(...EmitTaperedCylinder(SX, SY, 0.52 + Band * 0.98, "Z", 0.24, 0.24, 0.92, 8, (Band & 1) ? CourseMaterial.FrostingCream : CourseMaterial.PeppermintRed));
    // Warm Glowing Sugar-Pane Bakery Windows + Wafer Door
    Out.push(...EmitTranslatedBox(0.0, -3.05, 0.05, 1.45, 0.08, 2.35, CourseMaterial.WaferCrisp));
    for (const WX of [-2.15, 2.15])
    {
        Out.push(...EmitTranslatedBox(WX, -3.05, 1.55, 1.35, 0.06, 1.35, CourseMaterial.LampWarm));
        Out.push(...EmitTranslatedBox(WX,  3.05, 1.55, 1.35, 0.06, 1.35, CourseMaterial.LampWarm));
    }
    return Out;
}

// 📝 Peppermint Clocktower / Lighthouse Spire
export function EmitCandyClockTowerFacets()
{
    const Out = [];
    Out.push(...EmitTranslatedBox(0.0, 0.0, -0.50, 5.8, 5.8, 0.50, CourseMaterial.WaferCrisp));
    Out.push(...EmitTruncatedPyramid(0.0, 0.0, 0.03, 5.2, 5.2, 4.2, 4.2, 8.8, CourseMaterial.Gingerbread, CourseMaterial.FrostingCream));
    Out.push(...EmitTranslatedBox(0.0, 0.0, 8.86, 4.8, 4.8, 2.6, CourseMaterial.FrostingCream));
    // Glowing Peppermint Clock Dials on all 4 faces
    Out.push(...EmitTaperedCylinder( 2.46, 0.0, 10.15, "X", 0.95, 0.95, 0.08, 12, CourseMaterial.PeppermintRed, CourseMaterial.LampWarm, CourseMaterial.LampWarm));
    Out.push(...EmitTaperedCylinder(-2.46, 0.0, 10.15, "X", 0.95, 0.95, 0.08, 12, CourseMaterial.PeppermintRed, CourseMaterial.LampWarm, CourseMaterial.LampWarm));
    Out.push(...EmitTaperedCylinder(0.0,  2.46, 10.15, "Y", 0.95, 0.95, 0.08, 12, CourseMaterial.PeppermintRed, CourseMaterial.LampWarm, CourseMaterial.LampWarm));
    Out.push(...EmitTaperedCylinder(0.0, -2.46, 10.15, "Y", 0.95, 0.95, 0.08, 12, CourseMaterial.PeppermintRed, CourseMaterial.LampWarm, CourseMaterial.LampWarm));
    // Conical Berry-Gummy Spire + Gold Finial
    Out.push(...EmitTaperedCylinder(0.0, 0.0, 13.40, "Z", 2.65, 0.18, 3.80, 10, CourseMaterial.PeppermintRed, CourseMaterial.FrostingCream, CourseMaterial.Gold));
    return Out;
}

// 📝 Wafer-Blade Sugar Windmill
export function EmitCandyWindmillFacets()
{
    const Out = [];
    Out.push(...EmitTaperedCylinder(0.0, 0.0, 4.2, "Z", 3.1, 2.1, 9.2, 10, CourseMaterial.FrostingCream, CourseMaterial.Gingerbread, CourseMaterial.Gingerbread));
    Out.push(...EmitTaperedCylinder(0.0, 0.0, 9.8, "Z", 2.35, 0.25, 1.9, 10, CourseMaterial.Gingerbread));
    // Hub + 4 Crisscrossed Wafer Sails facing -X/+Y
    Out.push(...EmitTaperedCylinder(-2.35, 0.0, 7.4, "X", 0.48, 0.42, 0.75, 8, CourseMaterial.PeppermintRed));
    Out.push(...EmitTranslatedBox(-2.82, 0.0, 7.4 - 4.4, 0.14, 1.05, 8.8, CourseMaterial.WaferCrisp));
    Out.push(...EmitTranslatedBox(-2.82, 0.0, 7.4 - 0.52, 0.14, 8.8, 1.05, CourseMaterial.WaferCrisp));
    return Out;
}

// 📝 Arched Crispy-Wafer Lagoon Bridge (matches C¹ parabolic SplineRoad surface in ResolveCandySurfaces!)
export function EmitCandyWaferBridgeFacets(HalfRun = 34.0, HalfWidth = 4.6, DeckLift = 1.05)
{
    const Out = [];
    const Segs = 12;
    for (let I = 0; I < Segs; ++I)
    {
        const U0 = -1.0 + (2.0 * I) / Segs;
        const U1 = -1.0 + (2.0 * (I + 1)) / Segs;
        const UM = 0.5 * (U0 + U1);
        const X0 = U0 * HalfRun + 0.06, X1 = U1 * HalfRun - 0.06;
        const Lift = DeckLift * Math.max(0.0, 1.0 - UM * UM);
        // Deck slab + low Licorice/Peppermint side kerbs (disjoint by 3 cm for clean 2-manifold!)
        Out.push(...EmitTranslatedBox(0.5 * (X0 + X1), 0.0, Lift - 0.36, (X1 - X0), HalfWidth * 2.0, 0.36, CourseMaterial.WaferCrisp));
        Out.push(...EmitTranslatedBox(0.5 * (X0 + X1), -HalfWidth + 0.22, Lift + 0.03, (X1 - X0), 0.36, 0.42, (I & 1) ? CourseMaterial.PeppermintRed : CourseMaterial.FrostingCream));
        Out.push(...EmitTranslatedBox(0.5 * (X0 + X1),  HalfWidth - 0.22, Lift + 0.03, (X1 - X0), 0.36, 0.42, (I & 1) ? CourseMaterial.FrostingCream : CourseMaterial.PeppermintRed));
    }
    // Wafer Support Piers standing in the 2.5D Lagoon bed
    for (const U of [-0.55, 0.0, 0.55])
    {
        const TopZ = DeckLift * (1.0 - U * U) - 0.42;
        for (const SY of [-HalfWidth + 0.85, HalfWidth - 0.85])
            Out.push(...EmitTaperedCylinder(U * HalfRun, SY, TopZ * 0.5 - 0.85, "Z", 0.52, 0.44, TopZ + 1.70, 8, CourseMaterial.Gingerbread));
    }
    return Out;
}

// 📝 Peppermint Candy-Cane Village Archway
export function EmitCandyPeppermintArchFacets()
{
    const Out = [];
    for (const SY of [-6.8, 6.8])
    {
        for (let B = 0; B < 5; ++B)
            Out.push(...EmitTaperedCylinder(0.0, SY, 0.65 + B * 1.25, "Z", 0.52, 0.48, 1.18, 10, (B & 1) ? CourseMaterial.FrostingCream : CourseMaterial.PeppermintRed));
    }
    Out.push(...EmitTranslatedBox(0.0, 0.0, 6.72, 1.15, 15.2, 0.95, CourseMaterial.Gingerbread));
    Out.push(...EmitTranslatedBox(0.0, 0.0, 7.70, 1.35, 15.6, 0.36, CourseMaterial.FrostingCream));
    for (const Y of [-4.5, 0.0, 4.5])
        Out.push(...EmitEllipsoid(0.0, Y, 8.38, 0.52, 0.52, 0.42, 6, 10, Y === 0.0 ? CourseMaterial.GummyCherry : CourseMaterial.GummyLime));
    return Out;
}

// 📝 Giant Bouncy Translucent Gummy Pinball Cushion (high-restitution corner bumper!)
export function EmitCandyGummyBumperFacets(Mat = CourseMaterial.GummyCherry)
{
    const Out = [];
    Out.push(...EmitTaperedCylinder(0.0, 0.0, 0.12, "Z", 2.35, 2.25, 0.45, 14, CourseMaterial.FrostingCream));
    Out.push(...EmitEllipsoid(0.0, 0.0, 1.12, 2.22, 2.22, 1.18, 7, 14, Mat));
    return Out;
}

// 📝 Swirled Lollipop & Gumdrop Roadside Tree
export function EmitCandyLollipopTreeFacets(Mat = CourseMaterial.GummyCherry)
{
    const Out = [];
    Out.push(...EmitTaperedCylinder(0.0, 0.0, 1.85, "Z", 0.22, 0.18, 4.1, 8, CourseMaterial.FrostingCream));
    Out.push(...EmitTaperedCylinder(0.0, 0.0, 5.15, "Y", 1.65, 1.65, 0.52, 14, Mat, CourseMaterial.FrostingCream, CourseMaterial.FrostingCream));
    Out.push(...EmitTaperedCylinder(0.0, 0.0, 5.15, "Y", 0.85, 0.85, 0.62, 12, CourseMaterial.PeppermintRed));
    return Out;
}

// 📝 Grand Gingerbread Citadel Wall & Sweet-Gate Archway (Goal at X = +186 m!)
export function EmitCandyCitadelWallFacets()
{
    const Out = [];
    Out.push(...EmitTruncatedPyramid(0.0, 0.0, -0.5, 6.2, 20.0, 4.8, 20.0, 8.8, CourseMaterial.Gingerbread, CourseMaterial.FrostingCream));
    for (let Y = -8.0; Y <= 8.0; Y += 4.0)
    {
        Out.push(...EmitTranslatedBox(-1.6, Y, 8.35, 1.4, 2.1, 1.35, CourseMaterial.Gingerbread));
        Out.push(...EmitTranslatedBox(-1.6, Y, 9.73, 1.6, 2.3, 0.28, CourseMaterial.FrostingCream));
    }
    return Out;
}

export function EmitCandyCitadelGateFacets()
{
    const Out = [];
    for (const SY of [-11.5, 11.5])
    {
        Out.push(...EmitTruncatedPyramid(0.0, SY, -0.5, 7.6, 6.6, 6.2, 5.6, 12.2, CourseMaterial.Gingerbread, CourseMaterial.FrostingCream));
        Out.push(...EmitTaperedCylinder(0.0, SY, 13.8, "Z", 2.9, 0.25, 4.0, 10, CourseMaterial.PeppermintRed, CourseMaterial.FrostingCream, CourseMaterial.Gold));
    }
    Out.push(...EmitTranslatedBox(0.0, 0.0, 7.4, 6.6, 17.0, 3.6, CourseMaterial.Gingerbread));
    Out.push(...EmitTranslatedBox(0.0, 0.0, 11.04, 7.0, 17.4, 0.45, CourseMaterial.FrostingCream));
    Out.push(...EmitTranslatedBox(-3.42, 0.0, 8.4, 0.14, 11.0, 1.4, CourseMaterial.Gold));
    return Out;
}

//------------------------------------------------------------------------------------------------------------------------
//      DYNAMIC CANDY SIEGE UNITS: GUMMY-BEAR WORMS, GUMMY-BEAR CATAPULTS & OLD-SCHOOL CANDY CANNONS!
//------------------------------------------------------------------------------------------------------------------------

// 📝 Giant Gummy-Bear Worm HEAD: Translucent Cherry Gummy Bear face with round gummy ears, chubby snout, Licorice eyes & open jaw!
export function EmitCandyWormHeadFacets()
{
    const Out = [];
    // Plump rounded Gummy-Bear Cranium
    Out.push(...EmitEllipsoid( 0.0,  0.0, 1.18, 1.42, 1.36, 1.24, 7, 12, CourseMaterial.GummyCherry));
    // Two iconic round Gummy-Bear Ears on top!
    Out.push(...EmitEllipsoid(-0.22, -0.98, 2.26, 0.42, 0.36, 0.44, 5, 8, CourseMaterial.GummyCherry));
    Out.push(...EmitEllipsoid(-0.22,  0.98, 2.26, 0.42, 0.36, 0.44, 5, 8, CourseMaterial.GummyCherry));
    // Forward Gummy-Bear Snout + Licorice Nose + Glowing Licorice Eyes + White Sugar Fangs!
    Out.push(...EmitEllipsoid( 1.36,  0.0, 0.96, 0.58, 0.68, 0.48, 5, 10, CourseMaterial.GummyOrange));
    Out.push(...EmitEllipsoid( 1.94,  0.0, 1.12, 0.18, 0.24, 0.16, 4, 8, CourseMaterial.LicoriceBlack));
    Out.push(...EmitEllipsoid( 1.18, -0.56, 1.56, 0.20, 0.20, 0.22, 4, 8, CourseMaterial.LicoriceBlack));
    Out.push(...EmitEllipsoid( 1.18,  0.56, 1.56, 0.20, 0.20, 0.22, 4, 8, CourseMaterial.LicoriceBlack));
    Out.push(...EmitTaperedCylinder(1.52, -0.32, 0.52, "Z", 0.12, 0.03, 0.32, 6, CourseMaterial.FrostingCream));
    Out.push(...EmitTaperedCylinder(1.52,  0.32, 0.52, "Z", 0.12, 0.03, 0.32, 6, CourseMaterial.FrostingCream));
    return Out;
}

// 📝 Giant Gummy-Bear Worm BODY SEGMENT (translucent glossy gummy ring with stubby gummy-bear side paws!)
export function EmitCandyWormSegmentFacets(Mat = CourseMaterial.GummyLime)
{
    const Out = [];
    Out.push(...EmitEllipsoid(0.0,  0.0,  1.02, 1.22, 1.24, 1.08, 6, 12, Mat));
    Out.push(...EmitEllipsoid(0.1, -1.28, 0.52, 0.38, 0.32, 0.30, 4, 8,  Mat));
    Out.push(...EmitEllipsoid(0.1,  1.28, 0.52, 0.38, 0.32, 0.30, 4, 8,  Mat));
    return Out;
}

// 📝 Gummy-Bear Siege Catapult BASE (Wafer-Timber Frame + Peppermint Wheels + Sculpted Lime Gummy-Bear Crewman!)
export function EmitCandyCatapultBaseFacets()
{
    const Out = [];
    // Heavy Wafer-Timber Side Rails & Crossbeams
    Out.push(...EmitTranslatedBox(0.0, -1.32, 0.42, 5.4, 0.38, 0.46, CourseMaterial.WaferCrisp));
    Out.push(...EmitTranslatedBox(0.0,  1.32, 0.42, 5.4, 0.38, 0.46, CourseMaterial.WaferCrisp));
    Out.push(...EmitTranslatedBox(-2.1, 0.0,  0.46, 0.55, 2.20, 0.38, CourseMaterial.Gingerbread));
    Out.push(...EmitTranslatedBox( 2.1, 0.0,  0.46, 0.55, 2.20, 0.38, CourseMaterial.Gingerbread));
    // Upright Torsion A-Frame Posts + Crossbar Stop
    Out.push(...EmitTranslatedBox( 0.65, -1.32, 0.92, 0.44, 0.36, 2.65, CourseMaterial.Gingerbread));
    Out.push(...EmitTranslatedBox( 0.65,  1.32, 0.92, 0.44, 0.36, 2.65, CourseMaterial.Gingerbread));
    Out.push(...EmitTranslatedBox( 0.65,  0.0,  3.20, 0.48, 2.22, 0.42, CourseMaterial.PeppermintRed));
    // 4 Peppermint-Swirl Siege Wheels
    for (const WX of [-1.85, 1.85])
        for (const WY of [-1.66, 1.66])
            Out.push(...EmitTaperedCylinder(WX, WY, 0.68, "Y", 0.68, 0.68, 0.24, 12, CourseMaterial.LicoriceBlack, CourseMaterial.PeppermintRed, CourseMaterial.PeppermintRed));
    // Sculpted Giant Lime Gummy-Bear Crewman operating the winch on the right side!
    Out.push(...EmitEllipsoid(-1.35, 2.15, 0.95, 0.62, 0.58, 0.78, 6, 10, CourseMaterial.GummyLime)); // Gummy belly
    Out.push(...EmitEllipsoid(-1.35, 2.15, 2.08, 0.48, 0.48, 0.46, 5, 10, CourseMaterial.GummyLime)); // Gummy head
    Out.push(...EmitEllipsoid(-1.35, 1.82, 2.52, 0.18, 0.16, 0.18, 4, 6,  CourseMaterial.GummyLime)); // Left ear
    Out.push(...EmitEllipsoid(-1.35, 2.48, 2.52, 0.18, 0.16, 0.18, 4, 6,  CourseMaterial.GummyLime)); // Right ear
    Out.push(...EmitEllipsoid(-0.92, 1.72, 1.35, 0.42, 0.20, 0.20, 4, 6,  CourseMaterial.GummyLime)); // Winch arm
    return Out;
}

// 📝 Articulated Catapult Throwing Arm + Cupped Spoon (pivots around origin [0,0,0]!)
export function EmitCandyCatapultArmFacets()
{
    const Out = [];
    // Long Wafer Throwing Beam extending along -X from pivot [0,0,0] -> Cupped Spoon at X = -3.85 m!
    Out.push(...EmitTaperedCylinder( 0.0,  0.0, 0.0, "Y", 0.28, 0.28, 2.15, 8, CourseMaterial.LicoriceBlack));
    Out.push(...EmitTranslatedBox(-1.85, 0.0, -0.16, 4.10, 0.34, 0.32, CourseMaterial.WaferCrisp));
    Out.push(...EmitTaperedCylinder(-3.95, 0.0, 0.16, "Z", 0.72, 0.92, 0.46, 10, CourseMaterial.Gingerbread, CourseMaterial.CaramelSyrup, CourseMaterial.CaramelSyrup));
    return Out;
}

// 📝 Old-School Naval Candy Cannon: Flared Cast-Licorice & Gold-Brass Barrel on Wheeled Gingerbread Carriage!
export function EmitCandyOldCannonFacets()
{
    const Out = [];
    // Stepped Wooden Naval Gun Carriage Cheeks + Axles
    Out.push(...EmitTranslatedBox(-0.35, -0.68, 0.42, 3.10, 0.28, 0.78, CourseMaterial.Gingerbread));
    Out.push(...EmitTranslatedBox(-0.35,  0.68, 0.42, 3.10, 0.28, 0.78, CourseMaterial.Gingerbread));
    Out.push(...EmitTranslatedBox(-0.85,  0.0,  0.48, 2.10, 1.04, 0.34, CourseMaterial.WaferCrisp));
    for (const WX of [-1.25, 0.75])
        for (const WY of [-0.95, 0.95])
            Out.push(...EmitTaperedCylinder(WX, WY, 0.56, "Y", 0.56, 0.56, 0.22, 12, CourseMaterial.LicoriceBlack, CourseMaterial.PeppermintRed, CourseMaterial.PeppermintRed));
    // Classic Tapered Cast-Licorice Cannon Barrel + Brass Reinforcing Rings + Flared Muzzle Swell + Cascabel Knob!
    Out.push(...EmitTaperedCylinder( 0.85, 0.0, 1.38, "X", 0.54, 0.38, 3.85, 12, CourseMaterial.LicoriceBlack));
    Out.push(...EmitTaperedCylinder( 2.92, 0.0, 1.38, "X", 0.42, 0.52, 0.38, 12, CourseMaterial.Gold, CourseMaterial.LicoriceBlack, CourseMaterial.LicoriceBlack)); // Muzzle swell
    Out.push(...EmitTaperedCylinder( 0.10, 0.0, 1.38, "X", 0.56, 0.56, 0.22, 12, CourseMaterial.Gold)); // Brass trunnion band
    Out.push(...EmitTaperedCylinder( 1.55, 0.0, 1.38, "X", 0.48, 0.48, 0.20, 12, CourseMaterial.Gold)); // Brass chase ring
    Out.push(...EmitEllipsoid(-1.28, 0.0, 1.38, 0.28, 0.28, 0.28, 5, 8, CourseMaterial.Gold));          // Cascabel knob
    return Out;
}

// 📝 Flaming Gummy Ball Projectile (launched by Gummy-Bear Catapults, wreathed in 3D Navier-Stokes fire!)
export function EmitCandyFlamingGummyBallFacets()
{
    return EmitEllipsoid(0.0, 0.0, 0.0, 0.72, 0.72, 0.68, 6, 12, CourseMaterial.GummyOrange, CourseMaterial.GummyCherry);
}

// 📝 Hard-Candy Striped Jawbreaker Cannonball (fired by Old-School Candy Cannons!)
export function EmitCandyJawbreakerFacets()
{
    return EmitEllipsoid(0.0, 0.0, 0.0, 0.48, 0.48, 0.48, 6, 12, CourseMaterial.PeppermintRed, CourseMaterial.FrostingCream);
}

// 📝 Sticky Molten Caramel-Gummy Puddle (splatted on ground where Flaming Gummy Balls burst!)
export function EmitCandyStickyPuddleFacets()
{
    const Out = [];
    Out.push(...EmitTaperedCylinder(0.0, 0.0, 0.06, "Z", 3.65, 3.10, 0.14, 14, CourseMaterial.CaramelSyrup));
    Out.push(...EmitTaperedCylinder(0.0, 0.0, 0.16, "Z", 1.85, 1.35, 0.08, 12, CourseMaterial.GummyCherry));
    return Out;
}

//------------------------------------------------------------------------------------------------------------------------
//                                  CANDY VILLAGE SHAPE CATALOGS & PLACEMENTS
//------------------------------------------------------------------------------------------------------------------------

export const CandyStaticShapes = Object.freeze({
    CandyCottage:        { Emit: EmitCandyCottageFacets,                                                   Voxel: 0.24, Cards: 6 },
    CandyClockTower:     { Emit: EmitCandyClockTowerFacets,                                                Voxel: 0.26, Cards: 6 },
    CandyWindmill:       { Emit: EmitCandyWindmillFacets,                                                  Voxel: 0.26, Cards: 6 },
    CandyBridgeLong:     { Emit: () => EmitCandyWaferBridgeFacets(34.0, 4.6, 1.05),                        Voxel: 0.28, Cards: 5 },
    CandyBridgeShort:    { Emit: () => EmitCandyWaferBridgeFacets(17.0, 5.5, 0.62),                        Voxel: 0.26, Cards: 5 },
    CandyPeppermintArch: { Emit: EmitCandyPeppermintArchFacets,                                            Voxel: 0.24, Cards: 6 },
    CandyBumperCherry:   { Emit: () => EmitCandyGummyBumperFacets(CourseMaterial.GummyCherry),             Voxel: 0.16, Cards: 8 },
    CandyBumperLime:     { Emit: () => EmitCandyGummyBumperFacets(CourseMaterial.GummyLime),               Voxel: 0.16, Cards: 8 },
    CandyBumperOrange:   { Emit: () => EmitCandyGummyBumperFacets(CourseMaterial.GummyOrange),             Voxel: 0.16, Cards: 8 },
    CandyBumperBerry:    { Emit: () => EmitCandyGummyBumperFacets(CourseMaterial.GummyBerry),              Voxel: 0.16, Cards: 8 },
    CandyTreeCherry:     { Emit: () => EmitCandyLollipopTreeFacets(CourseMaterial.GummyCherry),            Voxel: 0.20, Cards: 0, Distance: false },
    CandyTreeLime:       { Emit: () => EmitCandyLollipopTreeFacets(CourseMaterial.GummyLime),              Voxel: 0.20, Cards: 0, Distance: false },
    CandyCitadelWall:    { Emit: EmitCandyCitadelWallFacets,                                               Voxel: 0.30, Cards: 5 },
    CandyCitadelGate:    { Emit: EmitCandyCitadelGateFacets,                                               Voxel: 0.28, Cards: 6 }
});

export const CandyCombatShapes = Object.freeze({
    CandyWormHead:       { Emit: EmitCandyWormHeadFacets,                                                  Voxel: 0.16, Cards: 0, Distance: false },
    CandyWormSegLime:    { Emit: () => EmitCandyWormSegmentFacets(CourseMaterial.GummyLime),               Voxel: 0.16, Cards: 0, Distance: false },
    CandyWormSegOrange:  { Emit: () => EmitCandyWormSegmentFacets(CourseMaterial.GummyOrange),             Voxel: 0.16, Cards: 0, Distance: false },
    CandyWormSegBerry:   { Emit: () => EmitCandyWormSegmentFacets(CourseMaterial.GummyBerry),              Voxel: 0.16, Cards: 0, Distance: false },
    CandyCatapultBase:   { Emit: EmitCandyCatapultBaseFacets,                                              Voxel: 0.18, Cards: 0, Distance: false },
    CandyCatapultArm:    { Emit: EmitCandyCatapultArmFacets,                                               Voxel: 0.14, Cards: 0, Distance: false },
    CandyOldCannon:      { Emit: EmitCandyOldCannonFacets,                                                 Voxel: 0.16, Cards: 0, Distance: false },
    CandyFlamingBall:    { Emit: EmitCandyFlamingGummyBallFacets,                                          Voxel: 0.12, Cards: 0, Distance: false },
    CandyJawbreaker:     { Emit: EmitCandyJawbreakerFacets,                                                Voxel: 0.10, Cards: 0, Distance: false },
    CandyStickyPuddle:   { Emit: EmitCandyStickyPuddleFacets,                                              Voxel: 0.14, Cards: 0, Distance: false }
});

export function ResolveCandyPlacements()
{
    const P = [];
    const Add = (Shape, Name, X, Y, Yaw = 0.0, Collider = true, ZLift = 0.0) =>
        P.push({ Shape, Name, Position: [X, Y, QueryCandyTerrainHeight(X, Y) + ZLift], Yaw, Collider });

    // ① District 1: Waffle Square Gingerbread Cottages & Peppermint Start Arch
    Add("CandyPeppermintArch", "Start Peppermint Arch", -178.0,   0.0, 0.0, false);
    const CottageSpots = [
        [-192.0, -20.5,  0.12], [-192.0,  20.5, -0.12],
        [-162.0, -23.5,  0.22], [-162.0,  23.5, -0.22],
        [ -28.0, -31.0,  0.18], [ -28.0,  31.0, -0.18],
        [   6.0, -30.5, -0.14], [   6.0,  30.5,  0.14],
        [  68.0, -30.5,  0.20], [  68.0,  30.5, -0.20],
        [ 104.0, -30.5, -0.15], [ 104.0,  30.5,  0.15]
    ];
    CottageSpots.forEach(([X, Y, Yaw], I) => Add("CandyCottage", `Gingerbread Cottage ${I + 1}`, X, Y, Yaw, true));

    // Clocktowers & Sugar Windmills on the Village Hills
    Add("CandyClockTower", "South Peppermint Clocktower", -142.0, -31.5,  0.30, true);
    Add("CandyClockTower", "North Peppermint Clocktower",  124.0,  31.5, -0.30, true);
    Add("CandyWindmill",   "Lagoon Overlook Windmill",     -86.0,  39.0, -1.25, true);
    Add("CandyWindmill",   "Caramel Ridge Windmill",        42.0, -39.5,  1.25, true);

    // ② Twin Wafer Arch Bridges over the 2.5D Fizzy Lagoon + Citadel Moat Causeway (Collider = false -> driven via C¹ Surfaces!)
    for (const Br of CandyWaferBridges)
    {
        const EndZ = QueryCandyTerrainHeight(Br.CX - Br.HalfRun, Br.CY);
        P.push({
            Shape:    Br.HalfRun > 25.0 ? "CandyBridgeLong" : "CandyBridgeShort",
            Name:     Br.Key,
            Position: [Br.CX, Br.CY, EndZ],
            Yaw:      0.0,
            Collider: false
        });
    }

    // ③ Mid-Village Peppermint Arches & Bouncy Gummy Pinball Bumpers (handled dynamically for elastic bounce, Collider = false!)
    Add("CandyPeppermintArch", "Crossroads Arch",   -4.0, 0.0, 0.0, false);
    Add("CandyPeppermintArch", "Siege Approach Arch", 86.0, 0.0, 0.0, false);

    const BumperShapes = {
        [CourseMaterial.GummyCherry]: "CandyBumperCherry",
        [CourseMaterial.GummyLime]:   "CandyBumperLime",
        [CourseMaterial.GummyOrange]: "CandyBumperOrange",
        [CourseMaterial.GummyBerry]:  "CandyBumperBerry"
    };
    CandyGummyBumpers.forEach((B, I) =>
    {
        Add(BumperShapes[B.Mat], `Gummy Pinball Bumper ${I + 1}`, B.Pos[0], B.Pos[1], 0.0, false, -0.05);
    });

    // ④ Lollipop Trees lining Village Boulevards
    const TreeCoords = [
        [-175.0, -13.5], [-175.0, 13.5], [-148.0, -14.0], [-148.0, 14.0],
        [ -42.0, -24.5], [ -42.0, 24.5], [  18.0, -22.0], [  18.0, 22.0],
        [  78.0, -21.5], [  78.0, 21.5], [ 122.0, -20.5], [ 122.0, 20.5]
    ];
    TreeCoords.forEach(([X, Y], I) =>
        Add((I & 1) ? "CandyTreeLime" : "CandyTreeCherry", `Lollipop Tree ${I + 1}`, X, Y, I * 0.6, false));

    // ⑤ District 5: Grand Gingerbread Citadel Wall & Sweet-Gate Archway at X = +188 m!
    Add("CandyCitadelGate", "Grand Citadel Sweet-Gate", 188.0,   0.0, 0.0, false);
    for (const Y of [-46.0, -26.0, 26.0, 46.0])
        Add("CandyCitadelWall", `Citadel Curtain Wall Y${Y}`, 188.0, Y, 0.0, true);

    return P;
}

export function ResolveCandySurfaces()
{
    const Out = CandyWaferBridges.map((Br) =>
    {
        const BaseZ = QueryCandyTerrainHeight(Br.CX - Br.HalfRun, Br.CY);
        const MinX  = Br.CX - Br.HalfRun,   MaxX = Br.CX + Br.HalfRun;
        const MinY  = Br.CY - Br.HalfWidth, MaxY = Br.CY + Br.HalfWidth;
        return {
            Key:          Br.Key,
            Category:     SurfaceCategory.SplineRoad,
            Origin:       [0.0, 0.0, 0.0],
            CosineYaw:    1.0,
            SineYaw:      0.0,
            Yaw:          0.0,
            Friction:     1.12,
            WorldMinimum: [MinX, MinY, BaseZ - 0.8],
            WorldMaximum: [MaxX, MaxY, BaseZ + Br.DeckLift + 1.2],
            Bounds:       { Minimum: [MinX, MinY, BaseZ - 0.8], Maximum: [MaxX, MaxY, BaseZ + Br.DeckLift + 1.2] },
            CastRay(Origin, Direction, MaxRange)
            {
                if (Math.abs(Direction[2]) < 1.0e-5)
                    return null;
                const ApproxT = ClampRayT((BaseZ + 0.5 * Br.DeckLift - Origin[2]) / Direction[2], MaxRange);
                if (ApproxT === null)
                    return null;
                const HX = Origin[0] + Direction[0] * ApproxT;
                const HY = Origin[1] + Direction[1] * ApproxT;
                if (HX < MinX || HX > MaxX || HY < MinY || HY > MaxY)
                    return null;
                const U = (HX - Br.CX) / Br.HalfRun;
                const Z = BaseZ + Br.DeckLift * Math.max(0.0, 1.0 - U * U);
                const ExactT = (Z - Origin[2]) / Direction[2];
                if (ExactT < 0.0 || ExactT > MaxRange)
                    return null;
                const SlopeX = (-2.0 * Br.DeckLift * U) / Br.HalfRun;
                const NormL  = Math.hypot(SlopeX, 1.0);
                return {
                    Travel:      ExactT,
                    LocalPoint:  [Origin[0] + Direction[0] * ExactT, Origin[1] + Direction[1] * ExactT, Z],
                    LocalNormal: [-SlopeX / NormL, 0.0, 1.0 / NormL]
                };
            }
        };
    });

    // Smooth Victory Plaza Pad through the Grand Citadel Sweet-Gate!
    const GateZ = QueryCandyTerrainHeight(188.0, 0.0) + 0.02;
    Out.push({
        Key:          "candy_citadel_plaza",
        Category:     SurfaceCategory.SplineRoad,
        Origin:       [0.0, 0.0, 0.0],
        CosineYaw:    1.0,
        SineYaw:      0.0,
        Yaw:          0.0,
        Friction:     1.10,
        WorldMinimum: [176.0, -9.2, GateZ - 0.5],
        WorldMaximum: [215.0,  9.2, GateZ + 0.5],
        Bounds:       { Minimum: [176.0, -9.2, GateZ - 0.5], Maximum: [215.0, 9.2, GateZ + 0.5] },
        CastRay(Origin, Direction, MaxRange)
        {
            if (Math.abs(Direction[2]) < 1.0e-5) return null;
            const T = (GateZ - Origin[2]) / Direction[2];
            if (T < 0.0 || T > MaxRange) return null;
            const HX = Origin[0] + Direction[0] * T, HY = Origin[1] + Direction[1] * T;
            if (HX < 176.0 || HX > 215.0 || HY < -9.2 || HY > 9.2) return null;
            return { Travel: T, LocalPoint: [HX, HY, GateZ], LocalNormal: [0.0, 0.0, 1.0] };
        }
    });
    return Out;
}

function ClampRayT(T, MaxRange)
{
    if (!Number.isFinite(T) || T < 0.0 || T > MaxRange)
        return null;
    return T;
}

export function ResolveCandyCones()
{
    return [];
}

export function ResolveCandyBreakables()
{
    // Shatterable Refractive Sugar-Glass Shortcut Panes ("tempered") + Crispy Wafer Crates ("wood")!
    const Panes = [
        { Name: "Peppermint Arch Sugar-Glass", Mat: "tempered", Extent: [0.35, 4.2, 2.4], Pos: [-178.0,  0.0] },
        { Name: "Crossroads Sugar-Glass Pane", Mat: "tempered", Extent: [0.35, 4.2, 2.4], Pos: [  -4.0,  0.0] },
        { Name: "Siege Arch Sugar-Glass Pane", Mat: "tempered", Extent: [0.35, 4.2, 2.4], Pos: [  86.0,  0.0] },
        { Name: "South Bridge Wafer Crate",    Mat: "wood",     Extent: [1.30, 1.30, 1.2], Pos: [ -62.0,-21.5] },
        { Name: "North Bridge Wafer Crate",    Mat: "wood",     Extent: [1.30, 1.30, 1.2], Pos: [ -62.0, 21.5] },
        { Name: "Sweet-Gate Sugar Crystal",    Mat: "glass",    Extent: [0.40, 4.6, 2.5], Pos: [ 184.0,  0.0] }
    ];
    return Panes.map((S, I) => ({
        Name:     S.Name,
        Material: S.Mat,
        Mode:     "baked",
        Shape:    { Kind: "box", Extent: S.Extent },
        Position: [S.Pos[0], S.Pos[1], QueryCandyTerrainHeight(S.Pos[0], S.Pos[1]) + 0.05],
        Yaw:      0.0,
        Approach: [1.0, 0.0, 0.0],
        Capacity: 10,
        Energy:   2400,
        Seed:     8801 + I * 53
    }));
}

//------------------------------------------------------------------------------------------------------------------------
//                           CANDY VILLAGE 3D TERRAIN MESH (SUGAR COBBLES, LICORICE LANES & HILLS)
//------------------------------------------------------------------------------------------------------------------------

function PickCandyGroundMaterial(X, Y, Z)
{
    const Carve = QueryCandyBasinCarve(X, Y);
    if (Carve > 0.45)
        return CourseMaterial.WaferCrisp; // Golden sandy sugar-wafer riverbed visible under shallow 2.5D soda water!
    if (Carve > 0.12)
        return CourseMaterial.FrostingCream; // Sugary shoreline bank!

    if (Math.abs(Y) > 31.5 || Z > 3.6)
        return CourseMaterial.FrostingCream; // Whipped royal-icing hills!

    // Winding Licorice S-Road + Peppermint Kerb Stripes + Sugar-Cobble Village Plazas!
    const LaneCenterY = 12.5 * Math.sin(X * 0.032);
    const DistToLane  = Math.abs(Y - LaneCenterY);
    const DistToStraight = Math.abs(Y);
    if (DistToLane < 5.2 || (X < -135.0 && DistToStraight < 7.5) || (X > 158.0 && DistToStraight < 8.5))
        return CourseMaterial.LicoriceBlack;
    if (Math.abs(DistToLane - 5.6) < 0.65)
        return (Math.floor(X * 0.45) & 1) ? CourseMaterial.PeppermintRed : CourseMaterial.FrostingCream;

    return CourseMaterial.SugarCobble;
}

export function EmitCandyGroundFacets()
{
    const Facets = [];
    const XMin = -225.0, XMax = 225.0, NX = 156;
    const YMin =  -64.0, YMax =  64.0, NY =  76;
    const DX = (XMax - XMin) / NX;
    const DY = (YMax - YMin) / NY;

    const GridZ = new Float32Array((NX + 1) * (NY + 1));
    for (let IX = 0; IX <= NX; ++IX)
    {
        const X = XMin + IX * DX;
        for (let IY = 0; IY <= NY; ++IY)
        {
            const Y = YMin + IY * DY;
            GridZ[IX * (NY + 1) + IY] = QueryCandyTerrainHeight(X, Y);
        }
    }

    for (let IX = 0; IX < NX; ++IX)
    {
        const X0 = XMin + IX * DX, X1 = X0 + DX, XM = 0.5 * (X0 + X1);
        for (let IY = 0; IY < NY; ++IY)
        {
            const Y0 = YMin + IY * DY, Y1 = Y0 + DY, YM = 0.5 * (Y0 + Y1);
            const Z00 = GridZ[IX       * (NY + 1) + IY];
            const Z10 = GridZ[(IX + 1) * (NY + 1) + IY];
            const Z11 = GridZ[(IX + 1) * (NY + 1) + (IY + 1)];
            const Z01 = GridZ[IX       * (NY + 1) + (IY + 1)];
            const Mat = PickCandyGroundMaterial(XM, YM, 0.25 * (Z00 + Z10 + Z11 + Z01));
            EmitQuad(Facets, [X0, Y0, Z00], [X1, Y0, Z10], [X1, Y1, Z11], [X0, Y1, Z01], Mat);
        }
    }

    // Outer Frosting-Snow Alpine Horizon Skirts
    const Skirts = [
        { X0: -310.0, X1: XMin,  Y0: -185.0, Y1:  185.0, SX: 6,  SY: 14 },
        { X0: XMin,   X1: XMax,  Y0: YMax,   Y1:  185.0, SX: 24, SY: 6  },
        { X0: XMin,   X1: XMax,  Y0: -185.0, Y1: YMin,   SX: 24, SY: 6  },
        { X0: XMax,   X1: 310.0, Y0: -185.0, Y1:  185.0, SX: 6,  SY: 14 }
    ];
    for (const B of Skirts)
    {
        const BX = (B.X1 - B.X0) / B.SX, BY = (B.Y1 - B.Y0) / B.SY;
        for (let I = 0; I < B.SX; ++I)
        {
            const AX0 = B.X0 + I * BX, AX1 = AX0 + BX;
            for (let J = 0; J < B.SY; ++J)
            {
                const AY0 = B.Y0 + J * BY, AY1 = AY0 + BY;
                EmitQuad(
                    Facets,
                    [AX0, AY0, QueryCandyTerrainHeight(AX0, AY0)],
                    [AX1, AY0, QueryCandyTerrainHeight(AX1, AY0)],
                    [AX1, AY1, QueryCandyTerrainHeight(AX1, AY1)],
                    [AX0, AY1, QueryCandyTerrainHeight(AX0, AY1)],
                    CourseMaterial.FrostingCream
                );
            }
        }
    }

    return Facets;
}

export const CandySpawn = Object.freeze({
    Position: [-198.0, 0.0, QueryCandyTerrainHeight(-198.0, 0.0) + 0.63],
    Yaw:      0.0
});

export const CandyZones = Object.freeze([
    { Name: "Waffle Square · Start",        Position: [-198.0,   0.0], Yaw: 0.0, Note: "Smash the Sugar-Glass Arch!" },
    { Name: "2.5D Fizzy Soda Lagoon Ford",  Position: [-130.0,   0.0], Yaw: 0.0, Note: "Wade the 2.5D water or take Wafer Bridges" },
    { Name: "Gummy-Worm Crossroads",        Position: [ -32.0,   0.0], Yaw: 0.0, Note: "Bank off bouncy Gummy cushions!" },
    { Name: "Catapult & Cannon Siege Run",  Position: [  58.0,   0.0], Yaw: 0.0, Note: "Dodge Flaming Gummy Balls & Jawbreakers" },
    { Name: "Grand Citadel Sweet-Gate",     Position: [ 168.0,   0.0], Yaw: 0.0, Note: "Final sprint across the 2.5D Soda Moat!" }
]);

export const CandyGoalX = 186.0;
