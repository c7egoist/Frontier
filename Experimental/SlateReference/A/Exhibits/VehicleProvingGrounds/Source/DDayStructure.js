//============================================================================================================================================
//                                                         DDAYSTRUCTURE.JS
//============================================================================================================================================
// ⚔️ Authentic Omaha Beach / Vierville Draw Tactical Assault Course ("dday"):
//    • 5-Tier Normandy Amphibious Topography (QueryDDayTerrainHeight, Z >= 0.06 m everywhere):
//      1. English Channel Surf & Beached Higgins LCVP Landing Craft (X = -245 .. -195 m)
//      2. Glossy Wet Low-Tide Foreshore studded with Rommel's Mined Log Ramps, Belgian Gates & Rusted Czech Hedgehogs (-195 .. -152 m)
//      3. Flint Shingle Embankment & Seawall Wire Line pierced by 3 Asymmetric Bangalore Torpedo Breaches (-152 .. -128 m)
//      4. No-Man's-Land Enfilade Kill Zones & Driveable Sunken Zig-Zag Trench Network (-1.42 m hull-down defilade, -128 .. +50 m)
//      5. Steep Coastal Bluffs (+8.5 m) & Central Chalk Spur splitting into the Vierville South Draw & Les Moulins North Defile (+50 .. +192 m)
//    • Authentic WWII Palette: OD#9 Olive-Drab Sherman Tanks with hull sandbags & white Allied stars, D-Day Invasion-Striped
//      Fighter-Bombers, Concertina Barbed Wire on timber X-pickets, Regelbau H677 Enfilade Casemates, and subtle partially-buried Tellermines.

import { CourseMaterial } from "./MaterialSpecification.js";
import { EmitQuad } from "./CourseStructure.js";
import { SurfaceCategory } from "./RampSurfaceProjection.js";

//------------------------------------------------------------------------------------------------------------------------
//                      OMAHA BEACH / VIERVILLE DRAW 3D TOPOGRAPHY, TRENCHES & KILL ZONES
//------------------------------------------------------------------------------------------------------------------------

export const DDayBounds = Object.freeze({
    Minimum: [-265.0, -165.0],
    Maximum: [ 285.0,  165.0]
});

// Bangalore Torpedo Breaches blown through the X = -140 m Shingle Seawall & Barbed Wire line:
export const DDayBangaloreBreaches = Object.freeze([
    { Y: -21.0, HalfWidth: 5.8, Label: "South Trench Gap" },
    { Y:   5.5, HalfWidth: 6.4, Label: "Center Armor Breach" },
    { Y:  25.5, HalfWidth: 5.5, Label: "North Bluff Flank" }
]);

// Driveable Sunken Zig-Zag Trench Network (carved -1.42 m below the plateau -> full hull-down MG defilade!):
export const DDayTrenchPolylines = Object.freeze([
    // South "Dog-Green" Zig-Zag Assault Trench (links South Bangalore Gap -> Vierville South Draw!)
    [
        [-130.0, -21.0],
        [-102.0, -24.5],
        [ -74.0, -14.0],
        [ -44.0, -23.5],
        [ -14.0, -13.5],
        [  16.0, -21.5],
        [  42.0, -16.5]
    ],
    // North "Les Moulins" Zig-Zag Communication Trench (links Center/North Beach -> North Defile!)
    [
        [-106.0,  17.5],
        [ -76.0,  25.0],
        [ -46.0,  15.5],
        [ -16.0,  24.5],
        [  14.0,  15.5],
        [  40.0,  19.0]
    ]
]);

// Interlocking Enfilade Kill Zones swept by elevated Bluff Casemates:
export const DDayKillZones = Object.freeze([
    { Name: "KILL ZONE ALPHA · BLOODY BOWL",   Center: [-76.0,   1.0], RadiusX: 34.0, RadiusY: 13.5 },
    { Name: "KILL ZONE BRAVO · CROSSFIRE SADDLE", Center: [ -2.0,  -1.0], RadiusX: 30.0, RadiusY: 12.5 },
    { Name: "KILL ZONE CHARLIE · WALL GLACIS", Center: [154.0,   0.0], RadiusX: 24.0, RadiusY: 16.0 }
]);

// 26 Asymmetric Artillery & 500-lb Bomb Craters [CenterX, CenterY, Radius, Depth, RimHeight]
export const DDayShellCraters = Object.freeze([
    [-176.0, -14.5,  5.6, 0.42, 0.24],
    [-166.0,  16.0,  6.2, 0.48, 0.26],
    [-154.0,  -3.0,  5.4, 0.44, 0.24],
    [-122.0,   4.5,  7.2, 0.78, 0.36],
    [-112.0, -10.5,  6.4, 0.72, 0.32],
    [ -94.0,   9.5,  7.6, 0.85, 0.38],
    [ -82.0,  -4.5,  6.8, 0.76, 0.34],
    [ -64.0,   3.0,  8.0, 0.90, 0.40],
    [ -52.0,  -8.5,  6.5, 0.74, 0.34],
    [ -34.0,   6.0,  7.4, 0.84, 0.38],
    [ -20.0,  -3.5,  6.8, 0.78, 0.35],
    [  -4.0,   4.5,  7.8, 0.88, 0.40],
    [  10.0,  -6.5,  6.6, 0.74, 0.34],
    [  28.0,   5.0,  7.2, 0.82, 0.36],
    [  52.0, -19.5,  6.2, 0.68, 0.32],
    [  66.0,  18.5,  6.8, 0.74, 0.34],
    [  84.0, -16.0,  6.5, 0.72, 0.34],
    [  98.0,  19.5,  7.0, 0.76, 0.36],
    [ 116.0, -15.0,  6.6, 0.72, 0.34],
    [ 128.0,  15.5,  6.8, 0.74, 0.35],
    [ 144.0,  -6.5,  7.4, 0.82, 0.38],
    [ 156.0,   8.0,  7.0, 0.78, 0.36],
    [ 168.0,  -9.5,  6.4, 0.70, 0.32],
    [ 174.0,  10.5,  6.2, 0.66, 0.30],
    [ -88.0,  31.0,  5.8, 0.62, 0.30],
    [  44.0,  -2.0,  6.6, 0.72, 0.34]
]);

function SmoothStep01(T)
{
    const C = Math.max(0.0, Math.min(1.0, T));
    return C * C * (3.0 - 2.0 * C);
}

function PointToSegmentDistanceAndParam(PX, PY, AX, AY, BX, BY)
{
    const VX = BX - AX, VY = BY - AY;
    const Len2 = VX * VX + VY * VY || 1.0;
    const T = Math.max(0.0, Math.min(1.0, ((PX - AX) * VX + (PY - AY) * VY) / Len2));
    const CX = AX + VX * T, CY = AY + VY * T;
    return { Dist: Math.hypot(PX - CX, PY - CY), T };
}

// 📝 Returns positive sunken trench depth [0 .. 1.42 m] at (X, Y), plus parapet lip boost along trench shoulders!
export function QueryDDayTrenchProfile(X, Y)
{
    if (X < -138.0 || X > 50.0 || Math.abs(Y) > 33.0)
        return { Depth: 0.0, Lip: 0.0 };

    let BestDist = 999.0;
    let EndFade  = 1.0;

    for (const Poly of DDayTrenchPolylines)
    {
        const TotalSegs = Poly.length - 1;
        for (let I = 0; I < TotalSegs; ++I)
        {
            const [AX, AY] = Poly[I];
            const [BX, BY] = Poly[I + 1];
            const { Dist, T } = PointToSegmentDistanceAndParam(X, Y, AX, AY, BX, BY);
            if (Dist < BestDist)
            {
                BestDist = Dist;
                // Smooth 10 m entry ramp on first segment and 10 m exit ramp on last segment so cars drive in/out seamlessly!
                const GlobalProgress = (I + T) / TotalSegs;
                const RampIn  = SmoothStep01(GlobalProgress / 0.09);
                const RampOut = SmoothStep01((1.0 - GlobalProgress) / 0.09);
                EndFade = Math.min(RampIn, RampOut);
            }
        }
    }

    // Flat 3.4 m bottom floor -> C¹ cosine wall up to 4.9 m -> +0.34 m sandbag/spoil parapet rim at 5.0..6.8 m!
    let Depth = 0.0;
    let Lip   = 0.0;
    if (BestDist < 4.9)
    {
        const WallFrac = BestDist <= 1.75 ? 1.0 : (0.5 + 0.5 * Math.cos(Math.PI * (BestDist - 1.75) / 3.15));
        Depth = 1.42 * WallFrac * EndFade;
    }
    else if (BestDist < 7.2)
    {
        const LipT = (BestDist - 4.9) / 2.3;
        Lip = 0.34 * Math.sin(Math.PI * LipT) * EndFade;
    }
    return { Depth, Lip };
}

export function QueryDDayTrenchDepth(X, Y)
{
    return QueryDDayTrenchProfile(X, Y).Depth;
}

// 📝 Exact analytical 3D Omaha Beach / Vierville Draw heightfield Z(X, Y) >= 0.06 m everywhere!
export function QueryDDayTerrainHeight(X, Y)
{
    // ① Base Shore-to-Wall Longitudinal Elevation Profile:
    //    • X <= -198 m: Channel Surf (0.08 m)
    //    • -198 .. -148 m: Wet & Dry Tidal Flat climbing 0.08 -> 1.45 m
    //    • -148 .. -126 m: Rise onto No-Man's-Land Trench Plateau (2.68 m)
    //    • -126 .. +185 m: Gradual climb up Bluff Draw to Atlantic Wall Glacis (2.68 -> 3.95 m)
    const SurfClimb    = 1.38 * SmoothStep01((X + 198.0) / 50.0);
    const PlateauClimb = 1.25 * SmoothStep01((X + 148.0) / 22.0);
    const DrawClimb    = 1.28 * SmoothStep01((X + 45.0)  / 215.0);
    let H = 0.08 + SurfClimb + PlateauClimb + DrawClimb;

    // ② The Omaha Shingle Bank & Timber Seawall Berm along X = -140 m (+1.15 m steep ridge, pierced by 3 Bangalore Gaps!)
    if (X > -156.0 && X < -124.0 && Math.abs(Y) < 42.0)
    {
        const RidgeBell = Math.exp(-((X + 140.0) * (X + 140.0)) / (2.0 * 5.2 * 5.2));
        let BreachCut = 1.0;
        for (const Gap of DDayBangaloreBreaches)
        {
            const DY = Math.abs(Y - Gap.Y);
            if (DY < Gap.HalfWidth + 3.5)
                BreachCut = Math.min(BreachCut, SmoothStep01((DY - (Gap.HalfWidth - 1.5)) / 5.0));
        }
        H += 1.12 * RidgeBell * BreachCut;
    }

    // ③ Steep Normandy Amphitheater Coastal Bluffs on North & South Flanks (|Y| > 30 m -> rises +6.8 m!)
    //    Gives German Casemates & 155mm Batteries real commanding cliff elevation overlooking the beach!
    const BluffStart = X < -155.0 ? 44.0 : 29.5;
    const AbsY = Math.abs(Y);
    if (AbsY > BluffStart && X < 194.0)
    {
        const BluffT = SmoothStep01((AbsY - BluffStart) / 22.0);
        const SeaFade = SmoothStep01((X + 188.0) / 38.0);
        H += (6.6 + 1.4 * Math.sin(X * 0.045 + Y * 0.03)) * BluffT * SeaFade;
    }

    // ④ Central Rocky Chalk Spur (X = +52 .. +136 m, Y ≈ +1 m):
    //    Splits the upper battlefield into TWO asymmetric Normandy Draws (Vierville South Draw & Les Moulins North Defile)!
    if (X > 44.0 && X < 144.0 && Math.abs(Y - 1.0) < 16.0)
    {
        const SpurX = Math.sin(Math.PI * SmoothStep01((X - 44.0) / 100.0));
        const SpurY = Math.exp(-((Y - 1.0) * (Y - 1.0)) / (2.0 * 6.4 * 6.4));
        H += 3.15 * SpurX * SpurY;
    }

    // ⑤ Organic Wind-Rippled Sand Dunes, Earth Berms & Battlefield Micro-Undulations (tapered near Wall Gate!)
    const GateFlatten = 1.0 - 0.85 * SmoothStep01((X - 178.0) / 14.0);
    const PlayMask    = (1.0 - SmoothStep01((AbsY - 52.0) / 28.0)) * GateFlatten;
    const Undulation  = (
        0.22 * Math.sin(X * 0.068 + Y * 0.052) +
        0.15 * Math.cos(X * 0.135 - Y * 0.105 + 0.9) +
        0.09 * Math.sin(X * 0.26  + Y * 0.22)
    ) * PlayMask * SmoothStep01((X + 190.0) / 25.0);
    H += Undulation;

    // ⑥ Driveable Sunken Zig-Zag Trench Network (-1.42 m hull-down channels + +0.34 m sandbag/spoil parapet rims!)
    const Trench = QueryDDayTrenchProfile(X, Y);
    H = H - Trench.Depth + Trench.Lip;

    // ⑦ 26 Sculpted Artillery & 500-lb Bomb Craters (raised blast ejecta rim + concave mud bowl)
    for (let I = 0; I < DDayShellCraters.length; ++I)
    {
        const [CX, CY, Rad, Depth, Rim] = DDayShellCraters[I];
        const DX = X - CX, DY = Y - CY;
        const ROuter = Rad * 1.48;
        if (Math.abs(DX) > ROuter || Math.abs(DY) > ROuter)
            continue;
        // Do not block Sunken Trench floors with crater rims
        if (Trench.Depth > 0.45)
            continue;
        const U = Math.hypot(DX, DY) / Rad;
        if (U < 1.0)
        {
            const Bowl = 0.5 * (1.0 + Math.cos(Math.PI * U));
            const LipRing = Math.sin(Math.PI * Math.pow(U, 1.35));
            H += -Depth * Bowl + Rim * 0.50 * LipRing;
        }
        else if (U < 1.48)
        {
            const T = (U - 1.0) / 0.48;
            H += Rim * 0.55 * (1.0 + Math.cos(Math.PI * T)) * 0.5;
        }
    }

    return Math.max(0.06, H);
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

function EmitTranslatedBox(CX, CY, BottomZ, SizeX, SizeY, SizeZ, Material)
{
    const Out = [];
    const HX = SizeX * 0.5, HY = SizeY * 0.5;
    EmitBox(Out, CX - HX, CY - HY, BottomZ, CX + HX, CY + HY, BottomZ + SizeZ, Material);
    return Out;
}

function EmitSlopedApronBox(CX, CY, BottomZ, LenX, LenY, ZNegX, ZPosX, Material)
{
    const Out = [];
    const X0 = CX - LenX * 0.5, X1 = CX + LenX * 0.5;
    const Y0 = CY - LenY * 0.5, Y1 = CY + LenY * 0.5;
    const ZB = BottomZ;
    const Z0 = BottomZ + ZNegX, Z1 = BottomZ + ZPosX;

    EmitQuad(Out, [X0, Y0, ZB], [X0, Y1, ZB], [X1, Y1, ZB], [X1, Y0, ZB], Material);
    EmitQuad(Out, [X0, Y0, Z0], [X1, Y0, Z1], [X1, Y1, Z1], [X0, Y1, Z0], Material);
    EmitQuad(Out, [X0, Y0, ZB], [X0, Y0, Z0], [X0, Y1, Z0], [X0, Y1, ZB], Material);
    EmitQuad(Out, [X1, Y0, ZB], [X1, Y1, ZB], [X1, Y1, Z1], [X1, Y0, Z1], Material);
    EmitQuad(Out, [X0, Y1, ZB], [X0, Y1, Z0], [X1, Y1, Z1], [X1, Y1, ZB], Material);
    EmitQuad(Out, [X0, Y0, ZB], [X1, Y0, ZB], [X1, Y0, Z1], [X0, Y0, Z0], Material);
    return Out;
}

function EmitTruncatedPyramid(CX, CY, BottomZ, BaseX, BaseY, TopX, TopY, Height, Material, TopMat = Material)
{
    const Out = [];
    const BX = BaseX * 0.5, BY = BaseY * 0.5;
    const TX = TopX  * 0.5, TY = TopY  * 0.5;
    const Z0 = BottomZ, Z1 = BottomZ + Height;

    const B00 = [CX - BX, CY - BY, Z0], B10 = [CX + BX, CY - BY, Z0];
    const B11 = [CX + BX, CY + BY, Z0], B01 = [CX - BX, CY + BY, Z0];
    const T00 = [CX - TX, CY - TY, Z1], T10 = [CX + TX, CY - TY, Z1];
    const T11 = [CX + TX, CY + TY, Z1], T01 = [CX - TX, CY + TY, Z1];

    EmitQuad(Out, B01, B11, B10, B00, Material);
    EmitQuad(Out, T00, T10, T11, T01, TopMat);
    EmitQuad(Out, B10, B11, T11, T10, Material);
    EmitQuad(Out, B01, B00, T00, T01, Material);
    EmitQuad(Out, B01, T01, T11, B11, Material);
    EmitQuad(Out, B00, B10, T10, T00, Material);
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

    const Center0 = MapPt(-Half, 0.0, 0.0);
    const Center1 = MapPt( Half, 0.0, 0.0);
    for (let I = 0; I < Sides; ++I)
    {
        const J = (I + 1) % Sides;
        EmitQuad(Out, Ring0[I], Ring0[J], Ring1[J], Ring1[I], SideMat);
        Out.push({ Family: Cap0Mat, Corners: [Center0, Ring0[J], Ring0[I]] });
        Out.push({ Family: Cap1Mat, Corners: [Center1, Ring1[I], Ring1[J]] });
    }
    return Out;
}

function EmitOrientedBeam(CX, CY, CZ, Dir, Length, WidthU, WidthV, Mat)
{
    const Out = [];
    const DL = Math.hypot(Dir[0], Dir[1], Dir[2]) || 1.0;
    const T = [Dir[0] / DL, Dir[1] / DL, Dir[2] / DL];
    const Ref = Math.abs(T[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    let U = [
        Ref[1] * T[2] - Ref[2] * T[1],
        Ref[2] * T[0] - Ref[0] * T[2],
        Ref[0] * T[1] - Ref[1] * T[0]
    ];
    const UL = Math.hypot(U[0], U[1], U[2]) || 1.0;
    U = [U[0] / UL, U[1] / UL, U[2] / UL];
    const V = [
        T[1] * U[2] - T[2] * U[1],
        T[2] * U[0] - T[0] * U[2],
        T[0] * U[1] - T[1] * U[0]
    ];
    const HL = Length * 0.5, HU = WidthU * 0.5, HV = WidthV * 0.5;
    const Pt = (SL, SU, SV) => [
        CX + T[0] * SL + U[0] * SU + V[0] * SV,
        CY + T[1] * SL + U[1] * SU + V[1] * SV,
        CZ + T[2] * SL + U[2] * SU + V[2] * SV
    ];

    const P000 = Pt(-HL, -HU, -HV), P100 = Pt( HL, -HU, -HV);
    const P110 = Pt( HL,  HU, -HV), P010 = Pt(-HL,  HU, -HV);
    const P001 = Pt(-HL, -HU,  HV), P101 = Pt( HL, -HU,  HV);
    const P111 = Pt( HL,  HU,  HV), P011 = Pt(-HL,  HU,  HV);

    EmitQuad(Out, P001, P101, P111, P011, Mat);
    EmitQuad(Out, P010, P110, P100, P000, Mat);
    EmitQuad(Out, P100, P110, P111, P101, Mat);
    EmitQuad(Out, P010, P000, P001, P011, Mat);
    EmitQuad(Out, P011, P111, P110, P010, Mat);
    EmitQuad(Out, P000, P100, P101, P001, Mat);
    return Out;
}

function EmitExtrudedPolygonZ(CX, CY, Z0, Height, Poly2D, SideMat, CapMat = SideMat)
{
    const Out = [];
    const N = Poly2D.length;
    const Z1 = Z0 + Height;
    const Bot = Poly2D.map(([X, Y]) => [CX + X, CY + Y, Z0]);
    const Top = Poly2D.map(([X, Y]) => [CX + X, CY + Y, Z1]);
    for (let I = 0; I < N; ++I)
    {
        const J = (I + 1) % N;
        EmitQuad(Out, Bot[I], Bot[J], Top[J], Top[I], SideMat);
    }
    for (let I = 1; I < N - 1; ++I)
    {
        Out.push({ Family: CapMat, Corners: [Top[0], Top[I], Top[I + 1]] });
        Out.push({ Family: CapMat, Corners: [Bot[0], Bot[I + 1], Bot[I]] });
    }
    return Out;
}

//------------------------------------------------------------------------------------------------------------------------
//                  AUTHENTIC OMAHA BEACH STATIC FORTIFICATIONS, LANDING CRAFT & OBSTACLES
//------------------------------------------------------------------------------------------------------------------------

// 📝 Higgins LCVP Landing Craft (dropped bow ramp in the surf right behind/beside Beachhead spawn!)
export function EmitHigginsLandingCraftFacets()
{
    const Out = [];
    // Flat-bottomed steel/plywood hull floor + port/starboard armored bulwarks + stern engine house
    Out.push(...EmitTranslatedBox(-0.6,  0.0, -0.35, 10.6, 3.55, 0.55, CourseMaterial.Cladding));
    Out.push(...EmitTranslatedBox(-0.8, -1.66, 0.22, 10.2, 0.24, 1.55, CourseMaterial.OliveDrabDark));
    Out.push(...EmitTranslatedBox(-0.8,  1.66, 0.22, 10.2, 0.24, 1.55, CourseMaterial.OliveDrabDark));
    Out.push(...EmitTranslatedBox(-4.6,  0.0,  0.22,  2.5, 3.04, 1.85, CourseMaterial.OliveDrab));
    // Coxswain armored shield + twin .30-cal gun tubs
    Out.push(...EmitTranslatedBox(-4.1,  0.0,  2.10,  1.1, 1.25, 0.65, CourseMaterial.SteelDark));
    Out.push(...EmitTaperedCylinder(-3.6, -1.15, 2.25, "Z", 0.42, 0.44, 0.42, 8, CourseMaterial.SteelDark));
    Out.push(...EmitTaperedCylinder(-3.6,  1.15, 2.25, "Z", 0.42, 0.44, 0.42, 8, CourseMaterial.SteelDark));
    // Lowered Bow Steel Ramp sloping forward onto the wet beach sand!
    Out.push(...EmitSlopedApronBox( 6.15, 0.0, -0.18, 2.75, 2.95, 0.44, 0.08, CourseMaterial.SteelDark));
    // White hull flotilla numbers stripe
    Out.push(...EmitTranslatedBox(-0.4, -1.81, 0.85, 2.4, 0.03, 0.42, CourseMaterial.PaintWhite));
    Out.push(...EmitTranslatedBox(-0.4,  1.81, 0.85, 2.4, 0.03, 0.42, CourseMaterial.PaintWhite));
    return Out;
}

// 📝 Rommel's Foreshore Mined Timber Log Ramp ("Hemmbalken"): angled timber beam braced on stakes with Tellermine on tip!
export function EmitMinedLogRampFacets()
{
    const Out = [];
    // Inclined heavy timber ramp log pointing seaward (-X low -> +X high) + rear vertical & diagonal support posts
    Out.push(...EmitOrientedBeam( 0.0,  0.0, 0.92, [0.88, 0.0, 0.46], 4.60, 0.34, 0.34, CourseMaterial.Wood));
    Out.push(...EmitTranslatedBox( 1.55, -0.35, -0.45, 0.28, 0.28, 2.25, CourseMaterial.Wood));
    Out.push(...EmitTranslatedBox( 1.55,  0.35, -0.45, 0.28, 0.28, 2.25, CourseMaterial.Wood));
    // Dark olive-rust Tellermine strapped to the seaward upper tip!
    Out.push(...EmitTaperedCylinder(-1.62, 0.0, 0.38, "Z", 0.30, 0.27, 0.14, 10, CourseMaterial.RustSteel, CourseMaterial.OliveDrabDark, CourseMaterial.OliveDrabDark));
    return Out;
}

// 📝 Cointet "Belgian Gate" Heavy Steel Lattice Beach Obstacle
export function EmitBelgianGateFacets()
{
    const Out = [];
    // Base steel cross-skids + upright steel frame + diagonal lattice braces
    Out.push(...EmitTranslatedBox(0.0, -1.35, -0.25, 2.10, 0.26, 0.24, CourseMaterial.RustSteel));
    Out.push(...EmitTranslatedBox(0.0,  1.35, -0.25, 2.10, 0.26, 0.24, CourseMaterial.RustSteel));
    Out.push(...EmitTranslatedBox(-0.15, 0.0,  0.02, 0.22, 3.10, 0.20, CourseMaterial.RustSteel));
    Out.push(...EmitTranslatedBox(-0.15, 0.0,  2.05, 0.22, 3.10, 0.20, CourseMaterial.RustSteel));
    for (const Y of [-1.35, -0.45, 0.45, 1.35])
        Out.push(...EmitTranslatedBox(0.12, Y, 0.02, 0.18, 0.18, 2.26, CourseMaterial.RustSteel));
    Out.push(...EmitOrientedBeam(0.36, 0.0, 1.12, [0.0, 0.82, 0.57], 3.30, 0.14, 0.14, CourseMaterial.SteelDark));
    return Out;
}

// 📝 Concertina Barbed Wire Entanglement on Crossed Timber/Steel X-Pickets (Crushable by Tanks & Snaggable by Cars!)
export function EmitBarbedWireEntanglementFacets()
{
    const Out = [];
    // 3 Crossed Timber X-Pickets along Y ∈ [-2.1, 0, +2.1]
    for (const Y of [-2.05, 0.0, 2.05])
    {
        Out.push(...EmitOrientedBeam(-0.08, Y, 0.56, [ 0.72, 0.0, 0.69], 1.65, 0.11, 0.11, CourseMaterial.Wood));
        Out.push(...EmitOrientedBeam( 0.08, Y, 0.56, [-0.72, 0.0, 0.69], 1.65, 0.11, 0.11, CourseMaterial.Wood));
    }
    // Concertina coiled barbed-wire loops + taut horizontal rusted wire strands spanning Y ∈ [-2.65 .. +2.65]
    for (const Z of [0.34, 0.72, 1.04])
        Out.push(...EmitTranslatedBox(0.0, 0.0, Z, 0.07, 5.30, 0.07, CourseMaterial.RustSteel));
    for (const Y of [-1.45, -0.72, 0.72, 1.45])
        Out.push(...EmitTaperedCylinder(0.0, Y, 0.58, "Y", 0.48, 0.48, 0.14, 8, CourseMaterial.RustSteel));
    return Out;
}

// 📝 Stacked Burlap Sandbag Trench Revetment / Gun Pit Parapet
export function EmitSandbagWallFacets()
{
    const Out = [];
    // 3 staggered courses of plump burlap sandbags + rear timber retaining stakes
    const Courses = [
        { Z: -0.18, Bags: [-1.50, -0.50, 0.50, 1.50], W: 0.94 },
        { Z:  0.14, Bags: [-1.05,  0.00, 1.05],       W: 0.96 },
        { Z:  0.46, Bags: [-1.35, -0.45, 0.45, 1.35], W: 0.86 }
    ];
    for (const C of Courses)
    {
        for (const BY of C.Bags)
            Out.push(...EmitTruncatedPyramid(0.0, BY, C.Z, 0.62, C.W, 0.50, C.W * 0.88, 0.29, CourseMaterial.SandbagBurlap));
    }
    for (const SY of [-1.65, 0.0, 1.65])
        Out.push(...EmitTranslatedBox(0.38, SY, -0.25, 0.11, 0.11, 1.02, CourseMaterial.Wood));
    return Out;
}

// 📝 Subtle German Wooden Stake `ACHTUNG MINEN` Triangular Warning Sign (marks mined shoulders naturally!)
export function EmitSubtleMineSignFacets()
{
    const Out = [];
    Out.push(...EmitTranslatedBox(0.0, 0.0, -0.25, 0.08, 0.08, 1.18, CourseMaterial.Wood));
    const Tri = [[0.0, -0.26], [0.0, 0.26], [0.0, 0.0]];
    // Crisp small weathered red-bordered white warning triangle (only 0.46 m wide — grounded & realistic, not a billboard!)
    const Plate = [[-0.03, -0.24], [0.03, -0.24], [0.03, 0.24], [-0.03, 0.24]];
    void Tri;
    Out.push(...EmitTruncatedPyramid(-0.06, 0.0, 0.68, 0.04, 0.46, 0.04, 0.06, 0.36, CourseMaterial.ContainerWhite));
    Out.push(...EmitTranslatedBox(-0.095, 0.0, 0.76, 0.02, 0.14, 0.12, CourseMaterial.ScorchedMud));
    void Plate;
    return Out;
}

// 📝 Regelbau H677 Atlantic Wall Enfilade Casemate Bunker (angled to sweep Kill Zones with flanking crossfire!)
export function EmitAtlanticBunkerFacets()
{
    const Out = [];
    const BasePoly = [
        [ 4.2, -3.4], [ 4.2,  3.4], [ 1.8,  5.0], [-3.4,  5.0],
        [-4.8,  3.2], [-4.8, -3.2], [-3.4, -5.0], [ 1.8, -5.0]
    ];
    Out.push(...EmitExtrudedPolygonZ(0.0, 0.0, -1.40, 2.35, BasePoly, CourseMaterial.TunnelConcrete, CourseMaterial.Concrete));

    // Stepped anti-ricochet embrasure cheek + dark recessed firing slit
    Out.push(...EmitTranslatedBox( 2.85,  0.0, 0.98, 2.10, 5.40, 0.24, CourseMaterial.Concrete));
    Out.push(...EmitTranslatedBox( 2.75, -2.55, 1.24, 2.20, 1.75, 0.62, CourseMaterial.Concrete));
    Out.push(...EmitTranslatedBox( 2.75,  2.55, 1.24, 2.20, 1.75, 0.62, CourseMaterial.Concrete));
    Out.push(...EmitTranslatedBox(-1.15,  0.0,  1.24, 5.20, 7.60, 0.62, CourseMaterial.Concrete));
    Out.push(...EmitTranslatedBox( 2.10,  0.0,  1.26, 0.65, 3.10, 0.56, CourseMaterial.Asphalt));

    // Thick overhanging reinforced roof slab + earth/sandbag camouflage sod cap + armored cupola!
    const RoofPoly = [
        [ 4.65, -3.7], [ 4.65,  3.7], [ 2.0,  5.3], [-3.6,  5.3],
        [-5.0,   3.4], [-5.0,  -3.4], [-3.6, -5.3], [ 2.0, -5.3]
    ];
    Out.push(...EmitExtrudedPolygonZ(0.0, 0.0, 1.89, 1.05, RoofPoly, CourseMaterial.TunnelConcrete, CourseMaterial.Stone));
    Out.push(...EmitTruncatedPyramid(-0.4, 0.0, 2.96, 6.4, 6.8, 4.4, 4.8, 0.42, CourseMaterial.Grass, CourseMaterial.Grass));
    Out.push(...EmitTaperedCylinder(-0.6, 0.0, 3.68, "Z", 1.38, 1.18, 0.58, 10, CourseMaterial.RustSteel, CourseMaterial.SteelDark, CourseMaterial.SteelDark));
    return Out;
}

// 📝 Salt-Rusted Czech Hedgehog (3 intersecting steel I-beams + center gusset collar)
export function EmitCzechHedgehogFacets()
{
    const Out = [];
    Out.push(...EmitOrientedBeam(0.0,  0.00, 0.88, [ 0.78,  0.46, 0.42], 2.55, 0.20, 0.20, CourseMaterial.RustSteel));
    Out.push(...EmitOrientedBeam(0.0,  0.03, 0.91, [-0.78,  0.46, 0.42], 2.55, 0.20, 0.20, CourseMaterial.RustSteel));
    Out.push(...EmitOrientedBeam(0.03,-0.02, 0.85, [ 0.05, -0.84, 0.54], 2.55, 0.20, 0.20, CourseMaterial.RustSteel));
    Out.push(...EmitTaperedCylinder(0.0, 0.0, 0.88, "Z", 0.32, 0.30, 0.30, 8, CourseMaterial.SteelDark));
    return Out;
}

// 📝 Concrete Dragon's Teeth Row (3 staggered anti-tank pyramids on sunken foundation apron)
export function EmitDragonToothClusterFacets()
{
    const Out = [];
    Out.push(...EmitTranslatedBox(0.0, 0.0, -0.65, 2.50, 4.90, 0.68, CourseMaterial.TunnelConcrete));
    Out.push(...EmitTruncatedPyramid(-0.22, -1.50, 0.05, 1.48, 1.38, 0.30, 0.30, 1.32, CourseMaterial.Concrete));
    Out.push(...EmitTruncatedPyramid( 0.26,  0.00, 0.05, 1.56, 1.44, 0.32, 0.32, 1.50, CourseMaterial.TunnelConcrete));
    Out.push(...EmitTruncatedPyramid(-0.22,  1.50, 0.05, 1.48, 1.38, 0.30, 0.30, 1.32, CourseMaterial.Concrete));
    return Out;
}

// 📝 THE WALL — Blast-Scarred Atlantic Wall Fortress Curtain
export function EmitTheWallSegmentFacets()
{
    const Out = [];
    Out.push(...EmitSlopedApronBox(-4.22, 0.0, -1.18, 3.20, 43.40, 1.55, 5.20, CourseMaterial.Stone));
    Out.push(...EmitTranslatedBox( 0.00, 0.0, -1.20, 5.20, 43.80, 14.80, CourseMaterial.Concrete));
    for (const Y of [-16.5, -5.5, 5.5, 16.5])
    {
        Out.push(...EmitSlopedApronBox(-3.45, Y, 4.05, 1.65, 2.80, 2.20, 9.40, CourseMaterial.TunnelConcrete));
        Out.push(...EmitTranslatedBox(-2.20, Y, 13.64, 1.40, 5.80, 1.35, CourseMaterial.Stone));
    }
    return Out;
}

// 📝 THE WALL — Breached Central Fortress Gate with Twin Gun Bastions & Searchlights
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
        Out.push(...EmitExtrudedPolygonZ(0.0, BY, -1.20, 17.60, BastionPoly, CourseMaterial.Concrete, CourseMaterial.Stone));
        Out.push(...EmitTaperedCylinder(-1.80, BY, 17.05, "Z", 2.35, 2.55, 1.15, 10, CourseMaterial.SteelDark));
        Out.push(...EmitTaperedCylinder(-2.10, BY, 18.30, "X", 0.90, 1.10, 0.85, 12, CourseMaterial.SteelDark, CourseMaterial.LampWarm, CourseMaterial.SteelDark));
    }
    Out.push(...EmitTranslatedBox( 0.00, 0.0, 9.20, 5.40, 21.80, 6.40, CourseMaterial.Concrete));
    Out.push(...EmitTranslatedBox(-2.82, 0.0, 9.60, 0.25, 17.60, 0.85, CourseMaterial.GateLamp));
    return Out;
}

//------------------------------------------------------------------------------------------------------------------------
//              AUTHENTIC WWII VEHICLES, WEAPONS & SUBTLE BURIED LANDMINES (2-MANIFOLD)
//------------------------------------------------------------------------------------------------------------------------

// 📝 US Army WWII M4A3E8 Sherman Assault Tank Hull in Authentic OD#9 Olive Drab!
//    • Dark gunmetal/rubber VVSS tracks & 12 bogie roadwheels (NO white undefined materials!)
//    • Matte Olive Drab sloped armor, front stacked Sandbag field-improvised armor & steel hedge-cutter / mine-plow teeth!
//    • Crisp weathered White Allied Recognition Star on hull sides & rear Olive stowage/wood ammo crates!
export function EmitDDayTankHullFacets()
{
    const Out = [];
    for (const SY of [-1, 1])
    {
        const TrackY = SY * 1.42;
        Out.push(...EmitTranslatedBox(0.0, TrackY, 0.00, 5.40, 0.62, 0.14, CourseMaterial.Tyre));
        Out.push(...EmitTranslatedBox(0.0, TrackY, 0.96, 6.45, 0.66, 0.14, CourseMaterial.Tyre));
        Out.push(...EmitTranslatedBox(0.0, TrackY, 1.12, 6.70, 0.76, 0.15, CourseMaterial.OliveDrabDark));

        const WheelXs = [-2.15, -1.29, -0.43, 0.43, 1.29, 2.15];
        for (const WX of WheelXs)
            Out.push(...EmitTaperedCylinder(WX, TrackY, 0.50, "Y", 0.34, 0.34, 0.56, 10, CourseMaterial.OliveDrabDark, CourseMaterial.SteelDark, CourseMaterial.SteelDark));
        Out.push(...EmitTaperedCylinder( 2.86, TrackY, 0.62, "Y", 0.31, 0.31, 0.58, 10, CourseMaterial.SteelDark));
        Out.push(...EmitTaperedCylinder(-2.86, TrackY, 0.62, "Y", 0.30, 0.30, 0.56, 10, CourseMaterial.SteelDark));
    }

    // Lower mud-darkened belly + OD#9 Olive Drab upper hull + sloped Sherman glacis!
    Out.push(...EmitTranslatedBox(-0.10, 0.0, 0.34, 5.75, 2.04, 0.68, CourseMaterial.OliveDrabDark));
    Out.push(...EmitTranslatedBox(-0.25, 0.0, 1.04, 5.10, 2.18, 0.50, CourseMaterial.OliveDrab));
    Out.push(...EmitSlopedApronBox( 2.76, 0.0, 0.44, 0.88, 2.08, 1.08, 0.38, CourseMaterial.OliveDrab));

    // Normandy Rhino Hedge-Cutter / Mine-Plow Steel Prongs + Improvised Front Glacis Sandbags!
    Out.push(...EmitSlopedApronBox( 3.44, 0.0, 0.08, 0.42, 3.25, 0.64, 0.16, CourseMaterial.RustSteel));
    for (const BY of [-0.72, 0.0, 0.72])
        Out.push(...EmitTruncatedPyramid(2.58, BY, 1.22, 0.48, 0.64, 0.38, 0.56, 0.24, CourseMaterial.SandbagBurlap));

    // Weathered White Allied Star Insignia panels on both hull sponsons + wooden ration crate & spare track on rear deck
    for (const SY of [-1, 1])
        Out.push(...EmitTranslatedBox(0.35, SY * 1.11, 1.16, 0.52, 0.03, 0.32, CourseMaterial.PaintWhite));
    Out.push(...EmitTranslatedBox(-2.25, -0.55, 1.56, 0.85, 0.68, 0.34, CourseMaterial.Wood));
    Out.push(...EmitTranslatedBox(-2.25,  0.55, 1.56, 0.85, 0.68, 0.28, CourseMaterial.SandbagBurlap));
    Out.push(...EmitTaperedCylinder(-2.98, -0.68, 1.22, "Y", 0.24, 0.24, 0.78, 10, CourseMaterial.OliveDrabDark));
    Out.push(...EmitTaperedCylinder(-2.98,  0.68, 1.22, "Y", 0.24, 0.24, 0.78, 10, CourseMaterial.OliveDrabDark));
    return Out;
}

// 📝 US Army M4 Sherman Cast 76mm/75mm Turret in OD#9 Olive Drab + Browning .50-cal Pintle MG!
export function EmitDDayTankTurretFacets()
{
    const Out = [];
    const TurretPoly = [
        [ 1.48, -0.82], [ 1.48,  0.82], [ 0.30,  1.16],
        [-1.55,  0.96], [-1.88,  0.56], [-1.88, -0.56],
        [-1.55, -0.96], [ 0.30, -1.16]
    ];
    Out.push(...EmitExtrudedPolygonZ(-0.10, 0.0, 0.0, 0.78, TurretPoly, CourseMaterial.OliveDrab, CourseMaterial.OliveDrab));
    Out.push(...EmitTranslatedBox(1.66, 0.0, 0.14, 0.34, 1.12, 0.52, CourseMaterial.OliveDrabDark));
    Out.push(...EmitTaperedCylinder(2.58, 0.0, 0.40, "X", 0.16, 0.13, 1.46, 10, CourseMaterial.OliveDrab));
    Out.push(...EmitTaperedCylinder(4.15, 0.0, 0.40, "X", 0.11, 0.095, 1.65, 10, CourseMaterial.OliveDrabDark));
    Out.push(...EmitTranslatedBox(5.12, 0.0, 0.28, 0.28, 0.28, 0.24, CourseMaterial.SteelDark));
    // White Allied Recognition Star on turret roof (for friendly fighter-bombers!) + Commander Cupola + .50-cal MG
    Out.push(...EmitTranslatedBox(-0.85, 0.0, 0.80, 0.56, 0.56, 0.03, CourseMaterial.PaintWhite));
    Out.push(...EmitTaperedCylinder(-0.35, -0.46, 0.94, "Z", 0.40, 0.36, 0.28, 10, CourseMaterial.OliveDrabDark));
    Out.push(...EmitTaperedCylinder( 0.42,  0.46, 1.02, "X", 0.045, 0.035, 1.05, 8, CourseMaterial.SteelDark));
    return Out;
}

// 📝 German Bunker MG-42 Armored Cupola Turret
export function EmitDDayMgTurretFacets()
{
    const Out = [];
    Out.push(...EmitTaperedCylinder(0.0, 0.0, 0.28, "Z", 0.92, 0.72, 0.56, 10, CourseMaterial.SteelDark, CourseMaterial.Concrete, CourseMaterial.SteelDark));
    Out.push(...EmitTranslatedBox(0.76, 0.0, 0.20, 0.42, 0.76, 0.38, CourseMaterial.RustSteel));
    Out.push(...EmitTaperedCylinder(1.68, -0.15, 0.39, "X", 0.055, 0.045, 1.38, 8, CourseMaterial.SteelDark));
    Out.push(...EmitTaperedCylinder(1.68,  0.15, 0.39, "X", 0.055, 0.045, 1.38, 8, CourseMaterial.SteelDark));
    return Out;
}

// 📝 German 155mm Coastal Fortress Gun in Dunkelgrau / Weathered Steel
export function EmitDDayHeavyCannonFacets()
{
    const Out = [];
    Out.push(...EmitTaperedCylinder(0.0, 0.0, -0.18, "Z", 1.75, 1.62, 0.36, 12, CourseMaterial.Concrete));
    Out.push(...EmitSlopedApronBox(1.18, 0.0, 0.20, 0.42, 2.55, 1.48, 0.95, CourseMaterial.SteelDark));
    Out.push(...EmitTranslatedBox(-0.15, 0.0, 0.20, 2.15, 1.28, 0.92, CourseMaterial.SteelDark));
    Out.push(...EmitTaperedCylinder(2.65, 0.0, 0.74, "X", 0.25, 0.20, 3.35, 12, CourseMaterial.SteelDark));
    Out.push(...EmitTaperedCylinder(5.45, 0.0, 0.74, "X", 0.18, 0.15, 2.22, 12, CourseMaterial.RustSteel));
    Out.push(...EmitTranslatedBox(6.78, 0.0, 0.52, 0.42, 0.56, 0.44, CourseMaterial.SteelDark));
    return Out;
}

// 📝 WWII P-47 / Typhoon Fighter-Bomber with Authentic Black-and-White D-Day Invasion Stripes!
export function EmitDDayAircraftFacets()
{
    const Out = [];
    // Olive-drab fuselage + radial engine cowling + bubble canopy
    Out.push(...EmitTaperedCylinder( 2.85, 0.0, 0.58, "X", 0.58, 0.46, 1.65, 12, CourseMaterial.OliveDrabDark, CourseMaterial.SteelDark, CourseMaterial.Asphalt));
    Out.push(...EmitTaperedCylinder( 0.45, 0.0, 0.58, "X", 0.60, 0.62, 3.10, 12, CourseMaterial.OliveDrab));
    Out.push(...EmitTaperedCylinder(-2.65, 0.0, 0.62, "X", 0.58, 0.24, 3.05, 10, CourseMaterial.OliveDrab));
    Out.push(...EmitTruncatedPyramid(0.35, 0.0, 1.22, 2.05, 0.68, 1.15, 0.44, 0.48, CourseMaterial.VehicleGlass));

    // Wings with iconic 5-band White/Black D-Day Invasion Stripes!
    for (const SY of [-1, 1])
    {
        Out.push(...EmitTranslatedBox(0.45, SY * 1.35, 0.34, 1.88, 1.42, 0.18, CourseMaterial.OliveDrab));
        // White-Black-White Invasion Stripe bands at mid-span!
        Out.push(...EmitTranslatedBox(0.45, SY * 2.38, 0.35, 1.84, 0.56, 0.18, CourseMaterial.PaintWhite));
        Out.push(...EmitTranslatedBox(0.45, SY * 2.98, 0.35, 1.80, 0.56, 0.18, CourseMaterial.Asphalt));
        Out.push(...EmitTranslatedBox(0.45, SY * 3.58, 0.35, 1.76, 0.56, 0.18, CourseMaterial.PaintWhite));
        Out.push(...EmitTranslatedBox(0.45, SY * 4.55, 0.36, 1.56, 1.32, 0.16, CourseMaterial.OliveDrab));
        // Underwing 500-lb bomb pylon
        Out.push(...EmitTaperedCylinder(0.50, SY * 2.20, 0.12, "X", 0.15, 0.12, 1.05, 8, CourseMaterial.OliveDrabDark));
    }

    // Tailplanes + Vertical Fin with Invasion Stripe band
    Out.push(...EmitTranslatedBox(-3.75, 0.0, 0.64, 0.95, 3.15, 0.12, CourseMaterial.OliveDrab));
    Out.push(...EmitTruncatedPyramid(-3.78, 0.0, 0.88, 1.18, 0.16, 0.55, 0.10, 1.48, CourseMaterial.OliveDrab));
    Out.push(...EmitTranslatedBox(-2.55, 0.0, 0.32, 0.52, 0.56, 0.62, CourseMaterial.PaintWhite));
    return Out;
}

export function EmitDDayPropellerFacets()
{
    const Out = [];
    Out.push(...EmitTaperedCylinder(0.08, 0.0, 0.0, "X", 0.24, 0.08, 0.38, 10, CourseMaterial.PaintYellow));
    Out.push(...EmitTranslatedBox(-0.06, 0.0, 0.0, 0.07, 2.75, 0.22, CourseMaterial.Asphalt));
    Out.push(...EmitTranslatedBox( 0.03, 0.0, 0.0, 0.07, 0.22, 2.75, CourseMaterial.Asphalt));
    return Out;
}

// 📝 Subtle Partially-Buried Tellermine: Low-profile weathered olive/rust steel disc in a disturbed mud collar (NO bright neon red!)
export function EmitDDayLandmineFacets()
{
    const Out = [];
    // Disturbed soil/mud ring flush with ground (h = 0.035 m) + low-profile olive-drab steel casing + rusted pressure cap
    Out.push(...EmitTaperedCylinder(0.0, 0.0, 0.018, "Z", 0.52, 0.44, 0.036, 10, CourseMaterial.ScorchedMud));
    Out.push(...EmitTaperedCylinder(0.0, 0.0, 0.056, "Z", 0.36, 0.32, 0.036, 10, CourseMaterial.OliveDrabDark));
    Out.push(...EmitTaperedCylinder(0.0, 0.0, 0.086, "Z", 0.16, 0.13, 0.020,  8, CourseMaterial.RustSteel));
    return Out;
}

export function EmitDDayAerialBombFacets()
{
    const Out = [];
    Out.push(...EmitTaperedCylinder( 0.52, 0.0, 0.0, "X", 0.25, 0.07, 0.60, 10, CourseMaterial.OliveDrabDark, CourseMaterial.OliveDrabDark, CourseMaterial.PaintYellow));
    Out.push(...EmitTaperedCylinder(-0.08, 0.0, 0.0, "X", 0.26, 0.25, 0.56, 10, CourseMaterial.OliveDrabDark));
    Out.push(...EmitTaperedCylinder(-0.56, 0.0, 0.0, "X", 0.12, 0.26, 0.36, 10, CourseMaterial.OliveDrabDark));
    Out.push(...EmitTranslatedBox(-0.78, 0.0, 0.0, 0.36, 0.64, 0.05, CourseMaterial.SteelDark));
    Out.push(...EmitTranslatedBox(-0.78, 0.0, 0.0, 0.36, 0.05, 0.64, CourseMaterial.SteelDark));
    return Out;
}

export function EmitDDayArtilleryShellFacets()
{
    const Out = [];
    Out.push(...EmitTaperedCylinder( 0.34, 0.0, 0.0, "X", 0.16, 0.04, 0.52, 10, CourseMaterial.OliveDrabDark, CourseMaterial.OliveDrabDark, CourseMaterial.Gold));
    Out.push(...EmitTaperedCylinder(-0.22, 0.0, 0.0, "X", 0.16, 0.16, 0.56, 10, CourseMaterial.Gold));
    return Out;
}

export function EmitDDayTracerBoltFacets()
{
    const Out = [];
    Out.push(...EmitTaperedCylinder(0.0, 0.0, 0.0, "X", 0.06, 0.03, 1.95, 6, CourseMaterial.TrafficOrange, CourseMaterial.LampWarm, CourseMaterial.TrafficRed));
    return Out;
}

//------------------------------------------------------------------------------------------------------------------------
//                           SHAPE CATALOGUES FOR FACETSTRUCTURE & LEVELSTRUCTURE
//------------------------------------------------------------------------------------------------------------------------

export const DDayStaticShapes = Object.freeze({
    DDayLandingCraft: { Emit: EmitHigginsLandingCraftFacets, Voxel: 0.22, Cards: 4 },
    DDayLogRamp:      { Emit: EmitMinedLogRampFacets,        Voxel: 0.12, Cards: 4 },
    DDayBelgianGate:  { Emit: EmitBelgianGateFacets,         Voxel: 0.12, Cards: 4 },
    DDaySandbagWall:  { Emit: EmitSandbagWallFacets,         Voxel: 0.10, Cards: 4 },
    DDayMineSign:     { Emit: EmitSubtleMineSignFacets,      Voxel: 0.0,  Cards: 0, Distance: false },
    DDayBunker:       { Emit: EmitAtlanticBunkerFacets,      Voxel: 0.28, Cards: 4 },
    DDayHedgehog:     { Emit: EmitCzechHedgehogFacets,       Voxel: 0.09, Cards: 4 },
    DDayDragonTooth:  { Emit: EmitDragonToothClusterFacets,  Voxel: 0.14, Cards: 4 },
    DDayWallSegment:  { Emit: EmitTheWallSegmentFacets,      Voxel: 0.45, Cards: 4 },
    DDayWallGate:     { Emit: EmitTheWallBreachGateFacets,   Voxel: 0.42, Cards: 4 }
});

export const DDayCombatShapes = Object.freeze({
    DDayTankHull:       { Emit: EmitDDayTankHullFacets,            Voxel: 0.0, Cards: 0, Distance: false },
    DDayTankTurret:     { Emit: EmitDDayTankTurretFacets,          Voxel: 0.0, Cards: 0, Distance: false },
    DDayMgTurret:       { Emit: EmitDDayMgTurretFacets,            Voxel: 0.0, Cards: 0, Distance: false },
    DDayHeavyCannon:    { Emit: EmitDDayHeavyCannonFacets,         Voxel: 0.0, Cards: 0, Distance: false },
    DDayAircraft:       { Emit: EmitDDayAircraftFacets,            Voxel: 0.0, Cards: 0, Distance: false },
    DDayPropeller:      { Emit: EmitDDayPropellerFacets,           Voxel: 0.0, Cards: 0, Distance: false },
    DDayLandmine:       { Emit: EmitDDayLandmineFacets,            Voxel: 0.0, Cards: 0, Distance: false },
    DDayBarbedWire:     { Emit: EmitBarbedWireEntanglementFacets,  Voxel: 0.0, Cards: 0, Distance: false },
    DDayAerialBomb:     { Emit: EmitDDayAerialBombFacets,          Voxel: 0.0, Cards: 0, Distance: false },
    DDayArtilleryShell: { Emit: EmitDDayArtilleryShellFacets,      Voxel: 0.0, Cards: 0, Distance: false },
    DDayTracerBolt:     { Emit: EmitDDayTracerBoltFacets,          Voxel: 0.0, Cards: 0, Distance: false }
});

//------------------------------------------------------------------------------------------------------------------------
//       ASYMMETRIC NORMANDY STRONGPOINTS, WINDING TANK ROUTES, BARBED WIRE & CAMOUFLAGED MINE APRONS
//------------------------------------------------------------------------------------------------------------------------

// 6 Elevated Bluff Strongpoint Casemates angled inward at 35°–55° to create genuine Enfilade Crossfire Kill Zones!
const RawBunkerConfigs = [
    { X: -64.0, Y: -34.5, Yaw:  Math.PI * 0.72 }, // WN-72 South Bluff -> sweeps Kill Zone Alpha NW!
    { X: -46.0, Y:  35.5, Yaw: -Math.PI * 0.74 }, // WN-71 North Bluff -> sweeps Kill Zone Alpha SW!
    { X:  22.0, Y:  36.0, Yaw: -Math.PI * 0.74 }, // WN-70 North Promontory -> sweeps Kill Zone Bravo!
    { X:  32.0, Y: -35.0, Yaw:  Math.PI * 0.74 }, // WN-68 South Ridge -> sweeps Kill Zone Bravo!
    { X:  94.0, Y:   1.0, Yaw:  Math.PI        }, // Central Chalk Spur Strongpoint splitting South Draw & North Defile!
    { X: 158.0, Y: -31.0, Yaw:  Math.PI * 0.80 }  // WN-62 Wall Glacis Flank Casemate!
];

export const DDayBunkerSites = Object.freeze(RawBunkerConfigs.map((B) => ({
    Pos: [B.X, B.Y, QueryDDayTerrainHeight(B.X, B.Y) - 0.18],
    Yaw: B.Yaw
})));

export const DDayMgMounts = Object.freeze(DDayBunkerSites.map((B) => [
    B.Pos[0] - Math.cos(B.Yaw) * 0.6,
    B.Pos[1] - Math.sin(B.Yaw) * 0.6,
    B.Pos[2] + 3.55
]));

// 6 Heavy 155mm Coastal Battery Positions perched high on the Bluffs & Wall Headlands!
const RawCannonXY = [
    [ 104.0, -39.0],
    [ 108.0,  39.0],
    [ 142.0,  38.0],
    [ 166.0,  33.0],
    [ 180.0, -28.0],
    [ 180.0,  28.0]
];

export const DDayCannonMounts = Object.freeze(RawCannonXY.map(([X, Y]) => [
    X, Y, QueryDDayTerrainHeight(X, Y) + 0.14
]));

// 5 Winding Multi-Waypoint Sherman Assault Routes (through Bangalore Breaches & Bluff Draws to The Wall!)
export const DDayTankWaypoints = Object.freeze([
    // Tank 0 (Lead Point Sherman — right ahead of player at Beachhead -> Center Bangalore Breach -> Vierville South Draw!)
    [[-176.0, -2.5], [-140.0,  4.5], [-92.0,  2.5], [-38.0, -5.0], [ 24.0, -9.5], [ 88.0, -15.5], [148.0, -8.5], [182.0, -3.5]],
    // Tank 1 (North Spearhead -> Center/North Breach -> Les Moulins North Defile!)
    [[-132.0,  6.5], [ -84.0, 10.5], [-28.0,  8.5], [ 34.0, 12.5], [ 94.0,  18.5], [152.0,  9.5], [182.0,  4.0]],
    // Tank 2 (South Trench Support -> South Bangalore Breach -> skirts Dog-Green Trench -> South Draw!)
    [[ -86.0,-18.0], [ -36.0,-10.5], [ 22.0,-11.5], [ 84.0,-17.5], [146.0,-10.0], [182.0, -5.0]],
    // Tank 3 (Upper North Defile Assault -> suppresses Central Spur & North Headland!)
    [[ -12.0,  9.0], [  46.0, 14.5], [102.0, 19.0], [156.0,  8.0], [182.0,  3.5]],
    // Tank 4 (Beachhead Reserve Wave -> rolls off LCVP #2 through South Gap!)
    [[-192.0,-19.0], [-140.0,-20.5], [-88.0,-11.0], [-24.0, -6.5], [ 44.0,-13.0], [106.0,-16.5], [162.0, -6.0], [182.0, -2.0]]
]);

// 24 Interactive Barbed Wire Entanglements [X, Y, Yaw] strung along the Shingle Crest (outside Bangalore gaps!),
// Trench Shoulders, and Central Chalk Spur!
export const DDayBarbedWirePlacements = Object.freeze([
    // Shingle Seawall Wire Line (leaves open gaps at Y = -21, +5.5, +25.5!)
    [-139.5, -31.5, 0.06], [-139.0, -12.5,-0.05], [-139.2,  -4.5, 0.04],
    [-139.0,  14.5,-0.04], [-139.5,  19.0, 0.08], [-139.8,  33.5,-0.06],
    // Kill Zone Alpha & Bravo Enfilade Funneling Wire (funnels exposed cars toward trenches or tank lanes!)
    [ -98.0,  -9.0, 0.28], [ -72.0,  12.5,-0.24], [ -54.0,  -8.5, 0.18],
    [ -26.0,  11.0,-0.22], [  -6.0,  -8.0, 0.25], [  18.0,   9.5,-0.20],
    // Central Spur & Bluff Draw Wire Aprons
    [  60.0,  -4.5, 0.38], [  64.0,   6.5,-0.36], [  82.0,  -8.5, 0.15],
    [  86.0,  10.5,-0.15], [ 114.0,  -7.5,-0.28], [ 118.0,   9.0, 0.28],
    // Final Wall Glacis Wire Obstacles
    [ 142.0, -19.5, 0.14], [ 144.0,  19.5,-0.14], [ 162.0, -14.5, 0.22],
    [ 162.0,  14.5,-0.22], [ 172.0, -17.5, 0.08], [ 172.0,  17.5,-0.08]
]);

// 28 Tactical Camouflaged Tellermines: placed on UNCLEARED shoulders, shortcut flanks & around obstacle gaps
// (NEVER lazily down the middle of Sherman Tank ruts — following Tank tracks or Trenches avoids mines naturally!)
export const DDayMineCoordinates = Object.freeze([
    // North Shortcut Shoulder Mines (around Y = +24..+29 m)
    [-156.0,  28.5], [-146.0,  22.0], [-126.0,  27.5], [-114.0,  24.0],
    // Un-cleared Beach Obstacle Bypass Pockets
    [-168.0, -11.5], [-160.0,   9.5], [-148.0,  -9.5], [-132.0, -11.0],
    // Kill Zone Alpha & Bravo Flank Mine Aprons (between open ground & bluff bases)
    [ -92.0, -28.5], [ -78.0,  28.5], [ -58.0, -27.5], [ -42.0,  27.5],
    [ -18.0, -26.5], [   4.0,  27.5], [  26.0, -26.5], [  36.0,  25.5],
    // Central Chalk Spur & Un-cleared Draw Shoulders
    [  58.0,   1.5], [  70.0,  -6.5], [  74.0,   8.5], [  96.0, -23.5],
    [ 104.0,  25.5], [ 122.0, -22.5], [ 126.0,  24.0], [ 138.0,   1.0],
    // Wall Glacis Outer Shoulders (central gate approach cleared by armor!)
    [ 154.0, -17.5], [ 158.0,  17.5], [ 170.0, -13.5], [ 170.0,  13.5]
]);

export function ResolveDDayPlacements()
{
    const P = [];
    const Put = (Name, Shape, X, Y, ZOff, Yaw, Collider = true) =>
    {
        P.push({
            Name,
            Shape,
            Position: [X, Y, QueryDDayTerrainHeight(X, Y) + ZOff],
            Yaw,
            Collider
        });
    };

    // ① 4 Beached Higgins LCVP Landing Craft along the surf line (LCVP #1 sits right behind player spawn [-198, -4]!)
    const LandingCraft = [
        [-209.5,  -4.0,  0.00],
        [-207.5, -23.5,  0.09],
        [-210.5,  14.5, -0.07],
        [-206.5,  31.0, -0.12]
    ];
    LandingCraft.forEach(([X, Y, Yaw], I) => Put(`Higgins LCVP ${I + 1}`, "DDayLandingCraft", X, Y, 0.12, Yaw, true));

    // ② Asymmetric Rommel Foreshore Obstacles in the Wet Low-Tide Sand (-188 .. -148 m):
    //    Mined Timber Log Ramps ("Hemmbalken"), Steel Belgian Gates & Salt-Rusted Czech Hedgehogs!
    const LogRamps = [
        [-184.0, -14.5, 0.08], [-181.0,   7.5,-0.06], [-177.0,  22.5, 0.11],
        [-171.0, -27.0,-0.09], [-167.0,  -8.5, 0.05], [-162.0,  14.0,-0.08]
    ];
    LogRamps.forEach(([X, Y, Yaw], I) => Put(`Rommel Log Ramp ${I + 1}`, "DDayLogRamp", X, Y, -0.05, Yaw, true));

    const BelgianGates = [
        [-179.0,  -0.5, 0.14], [-174.0, -19.5,-0.18], [-169.0,  19.0, 0.16],
        [-158.0, -15.5, 0.10], [-156.0,   1.5,-0.12], [-155.0,  19.5, 0.09]
    ];
    BelgianGates.forEach(([X, Y, Yaw], I) => Put(`Belgian Gate ${I + 1}`, "DDayBelgianGate", X, Y, -0.04, Yaw, true));

    const Hedgehogs = [
        [-185.0,   3.5], [-182.0, -29.0], [-175.0,  11.5], [-164.0, -22.5],
        [-161.0,  -3.5], [-152.0,  11.0], [-116.0,  -4.0], [ -88.0,   7.5],
        [ -58.0,  -2.5], [ -28.0,   4.0], [   8.0,  -3.5], [  72.0, -21.5],
        [ 108.0,  12.5], [ 148.0, -13.0], [ 152.0,  13.5]
    ];
    Hedgehogs.forEach(([X, Y], I) => Put(`Czech Hedgehog ${I + 1}`, "DDayHedgehog", X, Y, -0.06, I * 0.62, true));

    // ③ Sandbagged Trench Parapets & Gun-Pit Revetments lining Trench Mouths & Bluff Draws!
    const SandbagSpots = [
        [-132.0, -16.2,  0.12], [-132.0, -25.8, -0.12], // South Trench entrance cheeks
        [-108.0,  13.0,  0.20], [-108.0,  22.2, -0.18], // North Trench entrance cheeks
        [ -74.0,  -9.2,  0.35], [ -44.0, -28.2, -0.25],
        [ -46.0,  10.8, -0.32], [ -14.0,  -8.8,  0.28],
        [  42.0, -11.8,  0.15], [  40.0,  14.2, -0.15],
        [  90.0,  -5.5,  0.45], [  90.0,   7.5, -0.45],
        [ 166.0, -10.5,  0.30], [ 166.0,  10.5, -0.30]
    ];
    SandbagSpots.forEach(([X, Y, Yaw], I) => Put(`Sandbag Revetment ${I + 1}`, "DDaySandbagWall", X, Y, -0.04, Yaw, false));

    // ④ Dragon's Teeth Anti-Tank Lines guarding Bluff Shoulders & Central Chalk Spur!
    const TeethSites = [
        [-139.5, -36.5,  0.04], [-139.5,  37.5, -0.04],
        [  48.0,  -2.0,  0.22], [  52.0,   4.5, -0.22],
        [ 130.0,  -4.0, -0.18], [ 132.0,   5.5,  0.18],
        [ 174.0, -22.5,  0.12], [ 174.0,  22.5, -0.12]
    ];
    TeethSites.forEach(([X, Y, Yaw], I) => Put(`Dragon Teeth ${I + 1}`, "DDayDragonTooth", X, Y, -0.05, Yaw, true));

    // ⑤ Subtle Weathered Wooden `ACHTUNG MINEN` Stake Signs warning of mined shoulders & flanks!
    const MineSigns = [
        [-159.0,  25.5], [-170.0, -13.5], [ -95.0, -26.5], [ -81.0,  26.5],
        [  55.0,   0.5], [  94.0, -21.5], [ 101.0,  23.5], [ 151.0, -16.0], [ 155.0,  16.0]
    ];
    MineSigns.forEach(([X, Y], I) => Put(`Achtung Minen Stake ${I + 1}`, "DDayMineSign", X, Y, 0.0, (I % 2) * 0.25 - 0.12, false));

    // ⑥ 6 Elevated Enfilade Casemate Bunkers!
    DDayBunkerSites.forEach((B, I) =>
    {
        P.push({
            Name:     `Strongpoint Casemate WN-${72 - I}`,
            Shape:    "DDayBunker",
            Position: [...B.Pos],
            Yaw:      B.Yaw,
            Collider: true
        });
    });

    // ⑦ THE WALL (X = +191 m): Central Breached Bastion Gate + 4 Massive Flanking Fortress Curtains!
    const GateZ = QueryDDayTerrainHeight(191.0, 0.0);
    P.push({ Name: "Atlantic Wall Breach Gate",  Shape: "DDayWallGate",    Position: [191.0,   0.0, GateZ - 0.12], Yaw: 0.0, Collider: false });
    P.push({ Name: "Atlantic Wall North Inner",  Shape: "DDayWallSegment", Position: [191.0,  37.0, QueryDDayTerrainHeight(191.0,  25.0) - 0.25], Yaw: 0.0, Collider: true });
    P.push({ Name: "Atlantic Wall South Inner",  Shape: "DDayWallSegment", Position: [191.0, -37.0, QueryDDayTerrainHeight(191.0, -25.0) - 0.25], Yaw: 0.0, Collider: true });
    P.push({ Name: "Atlantic Wall North Outer",  Shape: "DDayWallSegment", Position: [191.0,  80.5, QueryDDayTerrainHeight(191.0,  65.0) - 0.25], Yaw: 0.0, Collider: true });
    P.push({ Name: "Atlantic Wall South Outer",  Shape: "DDayWallSegment", Position: [191.0, -80.5, QueryDDayTerrainHeight(191.0, -65.0) - 0.25], Yaw: 0.0, Collider: true });

    return P;
}

export function ResolveDDaySurfaces()
{
    const GateFloorZ = QueryDDayTerrainHeight(191.0, 0.0) + 0.03;
    const MakeGatePad = (Key, X0, X1, Y0, Y1, Z) => ({
        Key,
        Category:     SurfaceCategory.SplineRoad,
        Origin:       [0.0, 0.0, 0.0],
        CosineYaw:    1.0,
        SineYaw:      0.0,
        Yaw:          0.0,
        Friction:     1.08,
        WorldMinimum: [X0, Y0, Z - 0.5],
        WorldMaximum: [X1, Y1, Z + 0.5],
        Bounds:       { Minimum: [X0, Y0, Z - 0.5], Maximum: [X1, Y1, Z + 0.5] },
        CastRay(Origin, Direction, MaxRange)
        {
            if (Math.abs(Direction[2]) < 1.0e-5) return null;
            const T = (Z - Origin[2]) / Direction[2];
            if (T < 0.0 || T > MaxRange) return null;
            const HX = Origin[0] + Direction[0] * T;
            const HY = Origin[1] + Direction[1] * T;
            if (HX < X0 || HX > X1 || HY < Y0 || HY > Y1) return null;
            return { Travel: T, LocalPoint: [HX, HY, Z], LocalNormal: [0.0, 0.0, 1.0] };
        }
    });
    return [
        MakeGatePad("dday_breach_floor",   182.0, 206.0, -12.0, 12.0, GateFloorZ),
        MakeGatePad("dday_victory_plaza",  206.0, 232.0, -18.0, 18.0, GateFloorZ),
        MakeGatePad("dday_lcvp1_apron",   -205.5,-199.0,  -5.6, -2.4, QueryDDayTerrainHeight(-201.0, -4.0) + 0.02),
        MakeGatePad("dday_lcvp2_apron",   -203.5,-197.0, -25.0,-22.0, QueryDDayTerrainHeight(-199.0,-23.5) + 0.02)
    ];
}

export function ResolveDDayCones()
{
    return [];
}

export function ResolveDDayBreakables()
{
    // Breakable forward wooden supply crates & concrete obstacle blocks in the trenches & breaches!
    const Spots = [
        { Name: "Beach Supply Crate 1",  Mat: "wood",     Pos: [-163.0, -6.5] },
        { Name: "Shingle Breach Crate",  Mat: "wood",     Pos: [-137.0,  7.8] },
        { Name: "Dog-Green Trench Box",  Mat: "wood",     Pos: [ -74.0,-15.2] },
        { Name: "Vierville Draw Crate",  Mat: "wood",     Pos: [  68.0,-14.5] },
        { Name: "Breach Roadblock Slab", Mat: "concrete", Pos: [ 178.0,  0.0] }
    ];
    return Spots.map((S, I) => ({
        Name:     S.Name,
        Material: S.Mat,
        Mode:     "baked",
        Shape:    { Kind: "box", Extent: [1.35, 1.35, 1.15] },
        Position: [S.Pos[0], S.Pos[1], QueryDDayTerrainHeight(S.Pos[0], S.Pos[1]) + 0.04],
        Yaw:      0.31 * (I + 1),
        Approach: [1.0, 0.0, 0.0],
        Capacity: 10,
        Energy:   3200,
        Seed:     7701 + I * 43
    }));
}

//------------------------------------------------------------------------------------------------------------------------
//     HIGH-DENSITY 3D OMAHA BEACH TERRAIN MESH (SURF + WET SAND + SHINGLE + SUNKEN TRENCHES + BLUFFS + CRATERS)
//------------------------------------------------------------------------------------------------------------------------

function PickDDayGroundMaterial(X, Y, Z)
{
    // ① English Channel Surf & White Foam Line!
    if (X < -199.5)
        return CourseMaterial.ChannelWater;
    if (X < -196.5 + 1.8 * Math.sin(Y * 0.18))
        return CourseMaterial.PaintWhite; // breaking surf foam!

    // ② Sunken Zig-Zag Trench Floor & Mud Walls!
    const TrenchD = QueryDDayTrenchDepth(X, Y);
    if (TrenchD > 0.85)
        return (Math.floor((X + Y) * 1.4) & 1) === 0 ? CourseMaterial.Wood : CourseMaterial.ScorchedMud; // timber duckboards in mud!
    if (TrenchD > 0.25)
        return CourseMaterial.ScorchedMud;

    // ③ Bomb & Artillery Shell Crater Scorched Mud Bowls!
    for (let I = 0; I < DDayShellCraters.length; ++I)
    {
        const [CX, CY, Rad] = DDayShellCraters[I];
        if ((X - CX) * (X - CX) + (Y - CY) * (Y - CY) < (Rad * 0.92) * (Rad * 0.92))
            return CourseMaterial.ScorchedMud;
    }

    // ④ Glossy Wet Low-Tide Normandy Foreshore -> Dry Paleochre Sand -> Flint Shingle Bank!
    if (X < -168.0)
        return CourseMaterial.WetBeachSand;
    if (X < -149.0)
        return CourseMaterial.DryBeachSand;
    if (X < -129.0 && Math.abs(Y) < 40.0)
        return CourseMaterial.ShinglePebble;

    // ⑤ Steep Coastal Bluffs & Central Chalk Spur (Grass + Exposed Normandy Chalk/Stone Cliffs!)
    if (Z > 5.2)
        return (Math.abs(Y) < 42.0) ? CourseMaterial.Stone : CourseMaterial.Grass;
    if (Math.abs(Y) > 31.0 || (X > 52.0 && X < 136.0 && Math.abs(Y - 1.0) < 9.5))
        return CourseMaterial.Grass;

    // ⑥ Churn-tracked Tank Lanes & Draw Dirt Roads vs Grassy Bluff Scrub!
    if (X > 168.0 && Math.abs(Y) < 16.0)
        return CourseMaterial.Concrete;
    const Noise = Math.sin(X * 0.14 + Y * 0.19);
    if (Noise > 0.52 && Math.abs(Y) > 14.0)
        return CourseMaterial.Grass;
    return X < 35.0 ? CourseMaterial.DryBeachSand : CourseMaterial.Gravel;
}

export function EmitDDayGroundFacets()
{
    const Facets = [];

    // High-resolution 176 × 88 3D battlefield grid across X ∈ [-235..+215], Y ∈ [-66..+66] (~2.5 m × 1.5 m cells -> crisp trenches & craters!)
    const XMin = -235.0, XMax = 215.0, NX = 176;
    const YMin =  -66.0, YMax =  66.0, NY =  88;
    const DX = (XMax - XMin) / NX;
    const DY = (YMax - YMin) / NY;

    const GridZ = new Float32Array((NX + 1) * (NY + 1));
    for (let IX = 0; IX <= NX; ++IX)
    {
        const X = XMin + IX * DX;
        for (let IY = 0; IY <= NY; ++IY)
        {
            const Y = YMin + IY * DY;
            GridZ[IX * (NY + 1) + IY] = QueryDDayTerrainHeight(X, Y);
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
            const ZM  = 0.25 * (Z00 + Z10 + Z11 + Z01);

            const Mat = PickDDayGroundMaterial(XM, YM, ZM);
            EmitQuad(Facets, [X0, Y0, Z00], [X1, Y0, Z10], [X1, Y1, Z11], [X0, Y1, Z01], Mat);
        }
    }

    // Outer Horizon Skirts: English Channel Sea to the West (-320..-235), Normandy Headland Bluffs North/South (±66..±185), Rear Fortress (+215..+295)
    const SkirtBands = [
        { X0: -320.0, X1: XMin,  Y0: -185.0, Y1:  185.0, SX: 6,  SY: 18, Mat: CourseMaterial.ChannelWater },
        { X0: XMin,   X1: XMax,  Y0: YMax,   Y1:  185.0, SX: 28, SY: 8,  Mat: CourseMaterial.Grass },
        { X0: XMin,   X1: XMax,  Y0: -185.0, Y1: YMin,   SX: 28, SY: 8,  Mat: CourseMaterial.Grass },
        { X0: XMax,   X1: 295.0, Y0: -185.0, Y1:  185.0, SX: 8,  SY: 18, Mat: CourseMaterial.Grass }
    ];
    for (const B of SkirtBands)
    {
        const BX = (B.X1 - B.X0) / B.SX;
        const BY = (B.Y1 - B.Y0) / B.SY;
        for (let I = 0; I < B.SX; ++I)
        {
            const AX0 = B.X0 + I * BX, AX1 = AX0 + BX;
            for (let J = 0; J < B.SY; ++J)
            {
                const AY0 = B.Y0 + J * BY, AY1 = AY0 + BY;
                EmitQuad(
                    Facets,
                    [AX0, AY0, QueryDDayTerrainHeight(AX0, AY0)],
                    [AX1, AY0, QueryDDayTerrainHeight(AX1, AY0)],
                    [AX1, AY1, QueryDDayTerrainHeight(AX1, AY1)],
                    [AX0, AY1, QueryDDayTerrainHeight(AX0, AY1)],
                    B.Mat
                );
            }
        }
    }

    return Facets;
}

export const DDaySpawn = Object.freeze({
    Position: [-198.0, -4.0, QueryDDayTerrainHeight(-198.0, -4.0) + 0.63],
    Yaw:      0.0
});

export const DDayZones = Object.freeze([
    { Name: "Omaha Surf · Higgins LCVP",   Position: [-198.0,  -4.0], Yaw:   0.0, Note: "Roll off LCVP ramp into wet sand" },
    { Name: "Shingle Seawall Breach",      Position: [-144.0,   5.5], Yaw:   0.0, Note: "Bangalore gap behind Sherman #1" },
    { Name: "Dog-Green Sunken Trench",     Position: [-126.0, -21.0], Yaw:  -8.0, Note: "-1.4m hull-down MG defilade" },
    { Name: "Vierville Bluff Draw",        Position: [  48.0, -15.5], Yaw:   0.0, Note: "Flank Central Spur with armor" },
    { Name: "Atlantic Wall Breach Gate",   Position: [ 162.0,   0.0], Yaw:   0.0, Note: "Final artillery sprint to breach" }
]);

export const DDayWallGoalX = 188.0;
