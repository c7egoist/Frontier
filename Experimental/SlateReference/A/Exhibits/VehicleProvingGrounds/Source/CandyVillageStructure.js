//============================================================================================================================================
//                                                     CANDYVILLAGESTRUCTURE.JS
//============================================================================================================================================
// 🍬 Candy Village · Sugar Siege ("candy") — Full Gauntlet Architecture:
//    • High-Resolution 128 × 64 Refractive 2.5D Saint-Venant Shallow-Water Basin fed by 3 Giant Fizzy Soda-Bottle Waterfalls!
//    • 6 Continuous Skinned Refractive-Jelly Worms (live GPU vertex-streamed ringed annelid tubes — no disconnected beads!).
//    • 5 Heavy Torsion Siege Catapults where Flaming Gummy Boulders sit visibly inside the cupped spoon during wind-up & whip,
//      releasing along an exact Newtonian ballistic parabola onto glowing road target rings!
//    • 6 Recoiling Old-School Naval Candy Cannons + 5 Active Candy Gauntlet Obstacles blocking the road to the Sweet-Gate:
//      1. 4 Swinging Giant Jawbreaker Wrecking-Ball Pendulums across Bridges & Moat
//      2. 4 Overhead Slamming Peppermint Crusher Hammers in Village Bottlenecks
//      3. 6 Downhill Rolling Giant Peppermint Pinwheel Boulders
//      4. 6 Stretchy Saltwater-Taffy Viscoelastic Snare Strips
//      5. 8 Bubbling & Erupting Cola-Mentos Vertical Geyser Vents
//    • Every 3D solid is a strictly closed watertight 2-manifold (Boundary === 0, NonManifold === 0).

import { CourseMaterial } from "./MaterialSpecification.js";
import { EmitQuad } from "./CourseStructure.js";
import { SurfaceCategory } from "./RampSurfaceProjection.js";

//------------------------------------------------------------------------------------------------------------------------
//                           CANDY VILLAGE BOUNDS, BATHYMETRY & GAUNTLET PLACEMENT TABLES
//------------------------------------------------------------------------------------------------------------------------

export const CandyBounds = Object.freeze({
    Minimum: [-225.0, -76.0],
    Maximum: [ 225.0,  76.0]
});

// Fine 128 × 64 2.5D Shallow-Water Grid (~2.37 m × 1.22 m cells = 49,152 smooth-normal refractive liquid vertices!)
export const CandyWaterGridSpec = Object.freeze({
    XMin: -136.0,
    XMax:  168.0,
    YMin:  -39.0,
    YMax:   39.0,
    NX:    128,
    NY:     64,
    RestSurfaceZ: 1.76
});

// Skinned Continuous Jelly Worm Budget: 6 Worms × 22 Spine Rings × 10 Radial Sides (closed tube + end caps)
export const CandyWormMeshSpec = Object.freeze({
    WormCount:   6,
    RingsPerWorm:22,
    RadialSides: 10
});

// 3 Giant Hillside Fizzy Soda-Bottle Waterfalls pouring live currents & foam into the 2.5D waterways!
export const CandyWaterfallSites = Object.freeze([
    { Pos: [-86.0,  36.5], Yaw: -Math.PI * 0.5, PlungePos: [-86.0,  30.5], FlowV: -5.4 }, // Lagoon North Waterfall
    { Pos: [ 32.0, -36.5], Yaw:  Math.PI * 0.5, PlungePos: [ 32.0, -30.5], FlowV:  5.2 }, // Caramel Canal South Waterfall
    { Pos: [147.0,  36.5], Yaw: -Math.PI * 0.5, PlungePos: [147.0,  30.5], FlowV: -5.6 }  // Citadel Moat North Waterfall
]);

export const CandyWaferBridges = Object.freeze([
    { Key: "candy_bridge_south",  CX: -86.0, CY: -21.5, HalfRun: 34.0, HalfWidth: 4.6, DeckLift: 1.05 },
    { Key: "candy_bridge_north",  CX: -86.0, CY:  21.5, HalfRun: 34.0, HalfWidth: 4.6, DeckLift: 1.05 },
    { Key: "candy_moat_causeway", CX: 147.0, CY:   0.0, HalfRun: 17.0, HalfWidth: 5.5, DeckLift: 0.65 }
]);

// 8 Translucent Refractive Jelly Pinball Bumpers
export const CandyGummyBumpers = Object.freeze([
    { Pos: [-136.0,   0.0], Radius: 2.35, Mat: CourseMaterial.GummyCherry },
    { Pos: [ -36.0, -14.5], Radius: 2.35, Mat: CourseMaterial.GummyLime   },
    { Pos: [ -36.0,  14.5], Radius: 2.35, Mat: CourseMaterial.GummyOrange },
    { Pos: [   4.0,   0.0], Radius: 2.50, Mat: CourseMaterial.GummyBerry  },
    { Pos: [  52.0, -15.5], Radius: 2.35, Mat: CourseMaterial.GummyCherry },
    { Pos: [  52.0,  15.5], Radius: 2.35, Mat: CourseMaterial.GummyLime   },
    { Pos: [ 108.0, -10.0], Radius: 2.35, Mat: CourseMaterial.GummyOrange },
    { Pos: [ 108.0,  10.0], Radius: 2.35, Mat: CourseMaterial.GummyBerry  }
]);

// ① 6 Giant Skinned Refractive-Jelly Worms actively slithering ACROSS driving lanes & breaching 2.5D water!
export const CandyWormPatrols = Object.freeze([
    { Center: [-98.0,  -2.0], SpanX:  8.5, SpanY: 22.0, Speed: 0.92, Phase: 0.0,  Length: 16.5, Radius: 0.88, MatA: CourseMaterial.GummyCherry, MatB: CourseMaterial.GummyLime   },
    { Center: [-72.0,   4.0], SpanX:  9.0, SpanY: 24.0, Speed: 0.86, Phase: 2.1,  Length: 17.0, Radius: 0.90, MatA: CourseMaterial.GummyOrange, MatB: CourseMaterial.GummyBerry  },
    { Center: [-14.0,   0.0], SpanX: 11.0, SpanY: 19.5, Speed: 0.98, Phase: 1.1,  Length: 15.5, Radius: 0.84, MatA: CourseMaterial.GummyLime,   MatB: CourseMaterial.GummyCherry },
    { Center: [ 32.0,   0.0], SpanX:  9.5, SpanY: 23.0, Speed: 0.90, Phase: 3.4,  Length: 17.5, Radius: 0.92, MatA: CourseMaterial.GummyBerry,  MatB: CourseMaterial.GummyOrange },
    { Center: [ 96.0,   0.0], SpanX: 10.5, SpanY: 18.5, Speed: 1.04, Phase: 4.6,  Length: 15.5, Radius: 0.85, MatA: CourseMaterial.GummyCherry, MatB: CourseMaterial.GummyBerry  },
    { Center: [147.0,   0.0], SpanX:  7.5, SpanY: 21.0, Speed: 1.08, Phase: 5.5,  Length: 16.0, Radius: 0.88, MatA: CourseMaterial.GummyOrange, MatB: CourseMaterial.GummyLime   }
]);

// ② 5 Heavy Torsion Siege Catapults (spoon tip at local [-4.35, 0, 0.36] around pivot [0.85, 0, 2.35])
export const CandyCatapultSites = Object.freeze([
    { Pos: [ -52.0, -35.5], Yaw:  1.80 },
    { Pos: [  -8.0,  36.0], Yaw: -1.80 },
    { Pos: [  48.0, -36.0], Yaw:  1.88 },
    { Pos: [  98.0,  36.0], Yaw: -1.98 },
    { Pos: [ 168.0, -28.5], Yaw:  2.40 }
]);

// ③ 6 Wheeled Old-School Candy Cannons
export const CandyCannonSites = Object.freeze([
    { Pos: [ -42.0,  33.0], Yaw: -2.20 },
    { Pos: [  18.0, -33.0], Yaw:  2.15 },
    { Pos: [  74.0,  32.5], Yaw: -2.25 },
    { Pos: [ 118.0, -32.5], Yaw:  2.30 },
    { Pos: [ 178.0,  18.5], Yaw: -2.75 },
    { Pos: [ 178.0, -18.5], Yaw:  2.75 }
]);

// ④ 4 Colossal Swinging Jawbreaker Wrecking-Ball Pendulums spanning Bridges & Citadel Causeway!
export const CandyPendulumSites = Object.freeze([
    { Pos: [ -86.0, -21.5], PivotHeight: 8.6, ChainLen: 6.4, MaxAngle: 0.68, Speed: 1.85, Phase: 0.0  }, // South Wafer Bridge!
    { Pos: [ -86.0,  21.5], PivotHeight: 8.6, ChainLen: 6.4, MaxAngle: 0.68, Speed: 1.85, Phase: 1.57 }, // North Wafer Bridge!
    { Pos: [  86.0,   0.0], PivotHeight: 8.8, ChainLen: 6.6, MaxAngle: 0.78, Speed: 2.05, Phase: 0.8  }, // Siege Approach Arch!
    { Pos: [ 147.0,   0.0], PivotHeight: 8.8, ChainLen: 6.5, MaxAngle: 0.74, Speed: 2.20, Phase: 2.4  }  // Citadel Moat Causeway!
]);

// ⑤ 4 Overhead Slamming Peppermint Crusher Hammers in Village Choke Points!
export const CandyCrusherSites = Object.freeze([
    { Pos: [-156.0,   0.0], Period: 3.1, PhaseOffset: 0.0  },
    { Pos: [ -24.0,  -5.5], Period: 2.8, PhaseOffset: 0.9  },
    { Pos: [  66.0,   4.5], Period: 2.7, PhaseOffset: 1.7  },
    { Pos: [ 170.0,   0.0], Period: 2.5, PhaseOffset: 0.45 }
]);

// ⑥ 6 Stretchy Saltwater-Taffy Viscoelastic Snare Strips across greedy center shortcuts!
export const CandyTaffyStrips = Object.freeze([
    { Pos: [-166.0,   0.0], HalfX: 3.4, HalfY: 4.8 },
    { Pos: [ -44.0,   0.0], HalfX: 3.6, HalfY: 5.2 },
    { Pos: [  -2.0,  10.5], HalfX: 3.4, HalfY: 4.6 },
    { Pos: [  60.0,  -8.5], HalfX: 3.6, HalfY: 4.8 },
    { Pos: [ 118.0,   0.0], HalfX: 3.8, HalfY: 5.4 },
    { Pos: [ 162.0,   0.0], HalfX: 3.4, HalfY: 5.0 }
]);

// ⑦ 8 Bubbling & Erupting Cola-Mentos Vertical Geyser Vents!
export const CandyGeyserSites = Object.freeze([
    { Pos: [-144.0,  -5.0], PhaseOffset: 0.0 },
    { Pos: [ -62.0, -21.5], PhaseOffset: 1.4 }, // South bridge exit!
    { Pos: [ -62.0,  21.5], PhaseOffset: 2.8 }, // North bridge exit!
    { Pos: [  -8.0,  -8.0], PhaseOffset: 0.7 },
    { Pos: [  44.0,   6.0], PhaseOffset: 2.1 },
    { Pos: [  98.0,  -4.0], PhaseOffset: 3.5 },
    { Pos: [ 132.0,   3.5], PhaseOffset: 1.1 },
    { Pos: [ 176.0,   0.0], PhaseOffset: 2.5 }  // Right in front of Sweet-Gate!
]);

// ⑧ 6 Downhill Rolling Giant Peppermint Pinwheel Boulders (spawn high on North/South Hills and roll across road!)
export const CandyPinwheelLanes = Object.freeze([
    { X: -148.0, FromNorth: true,  Speed: 13.5, Delay: 0.2 },
    { X:  -48.0, FromNorth: false, Speed: 14.5, Delay: 1.4 },
    { X:   12.0, FromNorth: true,  Speed: 15.0, Delay: 0.7 },
    { X:   76.0, FromNorth: false, Speed: 15.5, Delay: 2.0 },
    { X:  124.0, FromNorth: true,  Speed: 16.0, Delay: 1.1 },
    { X:  164.0, FromNorth: false, Speed: 16.5, Delay: 2.5 }
]);

function SmoothStep01(T)
{
    const C = Math.max(0.0, Math.min(1.0, T));
    return C * C * (3.0 - 2.0 * C);
}

export function QueryCandyBasinCarve(X, Y)
{
    let Carve = 0.0;

    // ① Main Fizzy Berry-Soda Lagoon (X ∈ [-126 .. -46 m], Y ∈ [-36 .. +36 m]):
    if (X > -128.0 && X < -44.0 && Math.abs(Y) < 38.0)
    {
        const UX = SmoothStep01((X + 126.0) / 13.0) * SmoothStep01((-46.0 - X) / 13.0);
        const UY = SmoothStep01((36.5 - Math.abs(Y)) / 7.5);
        // Central shallow ford bar around Y = 0 (depth ~0.55 m) vs deep channels ~1.25 m under bridges!
        const FordBar = 0.56 * Math.exp(-(Y * Y) / (2.0 * 6.2 * 6.2));
        Carve = Math.max(Carve, (1.72 - FordBar) * UX * UY);
    }

    // ② Winding Mid-Village Soda-Caramel Canal (X ∈ [10 .. 54 m])
    if (X > 6.0 && X < 58.0 && Math.abs(Y) < 38.0)
    {
        const CanalCenterX = 32.0 + 7.2 * Math.sin(Y * 0.085);
        const DistX = Math.abs(X - CanalCenterX);
        if (DistX < 17.5)
        {
            const Bank = 0.5 * (1.0 + Math.cos(Math.PI * DistX / 17.5));
            const UY   = SmoothStep01((36.5 - Math.abs(Y)) / 7.0);
            const Ford = 0.40 * (Math.exp(-((Y - 13.5) ** 2) / 30.0) + Math.exp(-((Y + 13.5) ** 2) / 30.0));
            Carve = Math.max(Carve, Math.max(0.0, 1.52 * Bank - Ford) * UY);
        }
    }

    // ③ Grand Citadel Soda Moat (X ∈ [132 .. 162 m])
    if (X > 129.0 && X < 165.0 && Math.abs(Y) < 38.0)
    {
        const DistX = Math.abs(X - 147.0);
        if (DistX < 15.0)
        {
            const Bank = 0.5 * (1.0 + Math.cos(Math.PI * DistX / 15.0));
            const UY   = SmoothStep01((36.5 - Math.abs(Y)) / 7.0);
            Carve = Math.max(Carve, 1.62 * Bank * UY);
        }
    }

    return Carve;
}

export function QueryCandyTerrainHeight(X, Y)
{
    const GentleRise = 0.52 * SmoothStep01((X + 185.0) / 360.0);
    let H = 2.22 + GentleRise;

    const Carve = QueryCandyBasinCarve(X, Y);
    H -= Carve;

    const AbsY = Math.abs(Y);
    if (AbsY > 29.5 && X < 192.0)
    {
        const HillT = SmoothStep01((AbsY - 29.5) / 20.0);
        H += (4.55 + 0.85 * Math.sin(X * 0.05 + Y * 0.04)) * HillT;
    }

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

function EmitOrientedBeam(CX, CY, CZ, Dir, Length, WidthU, WidthV, Mat)
{
    const Out = [];
    const DL = Math.hypot(Dir[0], Dir[1], Dir[2]) || 1.0;
    const T  = [Dir[0] / DL, Dir[1] / DL, Dir[2] / DL];
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

//------------------------------------------------------------------------------------------------------------------------
//                      CANDY VILLAGE ARCHITECTURE, BRIDGES & OBSTACLE STRUCTURES (2-MANIFOLD)
//------------------------------------------------------------------------------------------------------------------------

export function EmitCandyCottageFacets()
{
    const Out = [];
    Out.push(...EmitTranslatedBox(0.0, 0.0, -0.45, 7.8, 6.6, 0.45, CourseMaterial.WaferCrisp));
    Out.push(...EmitTranslatedBox(0.0, 0.0,  0.03, 7.2, 6.0, 4.10, CourseMaterial.Gingerbread));
    Out.push(...EmitTruncatedPyramid(0.0, 0.0, 4.16, 8.2, 7.0, 7.6, 0.55, 2.65, CourseMaterial.FrostingCream, CourseMaterial.FrostingCream));
    Out.push(...EmitTranslatedBox(2.1, -1.5, 5.25, 0.95, 0.95, 2.05, CourseMaterial.Gingerbread));
    Out.push(...EmitTranslatedBox(2.1, -1.5, 7.33, 1.15, 1.15, 0.24, CourseMaterial.FrostingCream));
    const GumMats = [CourseMaterial.GummyCherry, CourseMaterial.GummyLime, CourseMaterial.GummyOrange, CourseMaterial.GummyBerry];
    for (let I = 0; I < 4; ++I)
        Out.push(...EmitEllipsoid(-2.7 + I * 1.8, 0.0, 7.08, 0.34, 0.34, 0.28, 5, 8, GumMats[I]));
    for (const SX of [-3.68, 3.68])
        for (const SY of [-3.08, 3.08])
            for (let Band = 0; Band < 4; ++Band)
                Out.push(...EmitTaperedCylinder(SX, SY, 0.52 + Band * 0.98, "Z", 0.24, 0.24, 0.92, 8, (Band & 1) ? CourseMaterial.FrostingCream : CourseMaterial.PeppermintRed));
    Out.push(...EmitTranslatedBox(0.0, -3.05, 0.05, 1.45, 0.08, 2.35, CourseMaterial.WaferCrisp));
    for (const WX of [-2.15, 2.15])
    {
        Out.push(...EmitTranslatedBox(WX, -3.05, 1.55, 1.35, 0.06, 1.35, CourseMaterial.LampWarm));
        Out.push(...EmitTranslatedBox(WX,  3.05, 1.55, 1.35, 0.06, 1.35, CourseMaterial.LampWarm));
    }
    return Out;
}

export function EmitCandyClockTowerFacets()
{
    const Out = [];
    Out.push(...EmitTranslatedBox(0.0, 0.0, -0.50, 5.8, 5.8, 0.50, CourseMaterial.WaferCrisp));
    Out.push(...EmitTruncatedPyramid(0.0, 0.0, 0.03, 5.2, 5.2, 4.2, 4.2, 8.8, CourseMaterial.Gingerbread, CourseMaterial.FrostingCream));
    Out.push(...EmitTranslatedBox(0.0, 0.0, 8.86, 4.8, 4.8, 2.6, CourseMaterial.FrostingCream));
    Out.push(...EmitTaperedCylinder( 2.46, 0.0, 10.15, "X", 0.95, 0.95, 0.08, 12, CourseMaterial.PeppermintRed, CourseMaterial.LampWarm, CourseMaterial.LampWarm));
    Out.push(...EmitTaperedCylinder(-2.46, 0.0, 10.15, "X", 0.95, 0.95, 0.08, 12, CourseMaterial.PeppermintRed, CourseMaterial.LampWarm, CourseMaterial.LampWarm));
    Out.push(...EmitTaperedCylinder(0.0,  2.46, 10.15, "Y", 0.95, 0.95, 0.08, 12, CourseMaterial.PeppermintRed, CourseMaterial.LampWarm, CourseMaterial.LampWarm));
    Out.push(...EmitTaperedCylinder(0.0, -2.46, 10.15, "Y", 0.95, 0.95, 0.08, 12, CourseMaterial.PeppermintRed, CourseMaterial.LampWarm, CourseMaterial.LampWarm));
    Out.push(...EmitTaperedCylinder(0.0, 0.0, 13.40, "Z", 2.65, 0.18, 3.80, 10, CourseMaterial.PeppermintRed, CourseMaterial.FrostingCream, CourseMaterial.Gold));
    return Out;
}

export function EmitCandyWindmillFacets()
{
    const Out = [];
    Out.push(...EmitTaperedCylinder(0.0, 0.0, 4.2, "Z", 3.1, 2.1, 9.2, 10, CourseMaterial.FrostingCream, CourseMaterial.Gingerbread, CourseMaterial.Gingerbread));
    Out.push(...EmitTaperedCylinder(0.0, 0.0, 9.8, "Z", 2.35, 0.25, 1.9, 10, CourseMaterial.Gingerbread));
    Out.push(...EmitTaperedCylinder(-2.35, 0.0, 7.4, "X", 0.48, 0.42, 0.75, 8, CourseMaterial.PeppermintRed));
    Out.push(...EmitTranslatedBox(-2.82, 0.0, 7.4 - 4.4, 0.14, 1.05, 8.8, CourseMaterial.WaferCrisp));
    Out.push(...EmitTranslatedBox(-2.82, 0.0, 7.4 - 0.52, 0.14, 8.8, 1.05, CourseMaterial.WaferCrisp));
    return Out;
}

// 📝 Giant Tilted Fizzy Soda-Bottle Waterfall Spout pouring sparkling soda into the 2.5D waterways!
export function EmitCandyWaterfallSpoutFacets()
{
    const Out = [];
    // Gingerbread trestle cradle + Giant Refractive Berry-Glass Soda Bottle + Foaming Waterfall Curtain!
    Out.push(...EmitTranslatedBox(-1.2, -1.6, -0.4, 2.8, 0.45, 3.6, CourseMaterial.Gingerbread));
    Out.push(...EmitTranslatedBox(-1.2,  1.6, -0.4, 2.8, 0.45, 3.6, CourseMaterial.Gingerbread));
    Out.push(...EmitOrientedBeam(-0.8, 0.0, 4.2, [0.90, 0.0, -0.44], 5.6, 2.5, 2.5, CourseMaterial.GummyBerry));
    Out.push(...EmitOrientedBeam( 2.2, 0.0, 2.7, [0.90, 0.0, -0.44], 1.8, 0.95, 0.95, CourseMaterial.WaterShallowCrystal));
    // Plunging translucent liquid waterfall column connecting bottle mouth down into the 2.5D pool!
    Out.push(...EmitTaperedCylinder(4.8, 0.0, -0.2, "Z", 1.55, 0.85, 5.2, 10, CourseMaterial.WaterShallowCrystal, CourseMaterial.FrostingCream, CourseMaterial.FrostingCream));
    return Out;
}

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
        Out.push(...EmitTranslatedBox(0.5 * (X0 + X1), 0.0, Lift - 0.36, (X1 - X0), HalfWidth * 2.0, 0.36, CourseMaterial.WaferCrisp));
        Out.push(...EmitTranslatedBox(0.5 * (X0 + X1), -HalfWidth + 0.22, Lift + 0.03, (X1 - X0), 0.36, 0.42, (I & 1) ? CourseMaterial.PeppermintRed : CourseMaterial.FrostingCream));
        Out.push(...EmitTranslatedBox(0.5 * (X0 + X1),  HalfWidth - 0.22, Lift + 0.03, (X1 - X0), 0.36, 0.42, (I & 1) ? CourseMaterial.FrostingCream : CourseMaterial.PeppermintRed));
    }
    for (const U of [-0.55, 0.0, 0.55])
    {
        const TopZ = DeckLift * (1.0 - U * U) - 0.42;
        for (const SY of [-HalfWidth + 0.85, HalfWidth - 0.85])
            Out.push(...EmitTaperedCylinder(U * HalfRun, SY, TopZ * 0.5 - 0.85, "Z", 0.52, 0.44, TopZ + 1.70, 8, CourseMaterial.Gingerbread));
    }
    return Out;
}

export function EmitCandyPeppermintArchFacets()
{
    const Out = [];
    for (const SY of [-6.8, 6.8])
        for (let B = 0; B < 5; ++B)
            Out.push(...EmitTaperedCylinder(0.0, SY, 0.65 + B * 1.25, "Z", 0.52, 0.48, 1.18, 10, (B & 1) ? CourseMaterial.FrostingCream : CourseMaterial.PeppermintRed));
    Out.push(...EmitTranslatedBox(0.0, 0.0, 6.72, 1.15, 15.2, 0.95, CourseMaterial.Gingerbread));
    Out.push(...EmitTranslatedBox(0.0, 0.0, 7.70, 1.35, 15.6, 0.36, CourseMaterial.FrostingCream));
    for (const Y of [-4.5, 0.0, 4.5])
        Out.push(...EmitEllipsoid(0.0, Y, 8.38, 0.52, 0.52, 0.42, 6, 10, Y === 0.0 ? CourseMaterial.GummyCherry : CourseMaterial.GummyLime));
    return Out;
}

export function EmitCandyGummyBumperFacets(Mat = CourseMaterial.GummyCherry)
{
    const Out = [];
    Out.push(...EmitTaperedCylinder(0.0, 0.0, 0.12, "Z", 2.35, 2.25, 0.42, 14, CourseMaterial.FrostingCream));
    Out.push(...EmitEllipsoid(0.0, 0.0, 1.18, 2.24, 2.24, 1.22, 7, 14, Mat));
    return Out;
}

export function EmitCandyLollipopTreeFacets(Mat = CourseMaterial.GummyCherry)
{
    const Out = [];
    Out.push(...EmitTaperedCylinder(0.0, 0.0, 1.85, "Z", 0.22, 0.18, 4.1, 8, CourseMaterial.FrostingCream));
    Out.push(...EmitTaperedCylinder(0.0, 0.0, 5.15, "Y", 1.65, 1.65, 0.52, 14, Mat, CourseMaterial.FrostingCream, CourseMaterial.FrostingCream));
    Out.push(...EmitTaperedCylinder(0.0, 0.0, 5.15, "Y", 0.85, 0.85, 0.62, 12, CourseMaterial.PeppermintRed));
    return Out;
}

// 📝 Colossal Candy-Cane Gantry Frame supporting a Swinging Jawbreaker Wrecking Pendulum!
export function EmitCandyPendulumGantryFacets()
{
    const Out = [];
    for (const SY of [-6.2, 6.2])
    {
        Out.push(...EmitOrientedBeam(-1.8, SY, 4.3, [ 0.38, 0.0, 0.92], 9.2, 0.52, 0.52, CourseMaterial.PeppermintRed));
        Out.push(...EmitOrientedBeam( 1.8, SY, 4.3, [-0.38, 0.0, 0.92], 9.2, 0.52, 0.52, CourseMaterial.FrostingCream));
    }
    Out.push(...EmitTaperedCylinder(0.0, 0.0, 8.65, "Y", 0.42, 0.42, 13.6, 10, CourseMaterial.Gold));
    return Out;
}

// 📝 Overhead Peppermint Crusher Hammer Gantry Frame
export function EmitCandyCrusherFrameFacets()
{
    const Out = [];
    for (const SY of [-5.2, 5.2])
    {
        for (let B = 0; B < 5; ++B)
            Out.push(...EmitTaperedCylinder(0.0, SY, 0.62 + B * 1.32, "Z", 0.56, 0.52, 1.24, 10, (B & 1) ? CourseMaterial.PeppermintRed : CourseMaterial.FrostingCream));
    }
    Out.push(...EmitTranslatedBox(0.0, 0.0, 6.95, 1.85, 11.8, 1.05, CourseMaterial.Gingerbread));
    Out.push(...EmitTranslatedBox(0.0, 0.0, 8.04, 2.10, 12.2, 0.32, CourseMaterial.Gold));
    return Out;
}

// 📝 Stretchy Saltwater-Taffy Snare Pool on the Road!
export function EmitCandyTaffyStripFacets()
{
    const Out = [];
    Out.push(...EmitTaperedCylinder( 0.0,  0.0, 0.05, "Z", 4.10, 3.65, 0.12, 14, CourseMaterial.TaffyPink));
    Out.push(...EmitTaperedCylinder( 0.5, -1.1, 0.14, "Z", 1.95, 1.55, 0.08, 12, CourseMaterial.CaramelSyrup));
    Out.push(...EmitTaperedCylinder(-0.6,  1.2, 0.14, "Z", 1.80, 1.40, 0.08, 12, CourseMaterial.FrostingCream));
    return Out;
}

// 📝 Cola-Mentos Cobblestone Geyser Vent Collar
export function EmitCandyGeyserVentFacets()
{
    const Out = [];
    Out.push(...EmitTaperedCylinder(0.0, 0.0, 0.12, "Z", 1.85, 1.45, 0.28, 12, CourseMaterial.PeppermintRed, CourseMaterial.LicoriceBlack, CourseMaterial.LicoriceBlack));
    Out.push(...EmitTaperedCylinder(0.0, 0.0, 0.29, "Z", 1.15, 1.05, 0.08, 12, CourseMaterial.CaramelSyrup));
    return Out;
}

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
//      DYNAMIC CANDY SIEGE & TRAP SHAPES (HEAVY TORSION CATAPULT, NAVAL CANNON, PENDULUM, CRUSHER & PINWHEEL)
//------------------------------------------------------------------------------------------------------------------------

// 📝 Heavy Torsion Onager Siege Catapult BASE (6.8 m × 3.8 m braced timber frame + crossbar stop + winch + 2 Refractive Jelly Crew!)
export function EmitCandyCatapultBaseFacets()
{
    const Out = [];
    // Heavy Side Sills & Crossbeams
    Out.push(...EmitTranslatedBox( 0.0, -1.55, 0.44, 6.8, 0.46, 0.54, CourseMaterial.WaferCrisp));
    Out.push(...EmitTranslatedBox( 0.0,  1.55, 0.44, 6.8, 0.46, 0.54, CourseMaterial.WaferCrisp));
    Out.push(...EmitTranslatedBox(-2.7,  0.0,  0.50, 0.68, 2.58, 0.44, CourseMaterial.Gingerbread));
    Out.push(...EmitTranslatedBox( 0.85, 0.0,  0.50, 0.78, 2.58, 0.48, CourseMaterial.Gingerbread));
    Out.push(...EmitTranslatedBox( 2.8,  0.0,  0.50, 0.68, 2.58, 0.44, CourseMaterial.Gingerbread));
    // Heavy Upright Stanchions + Angled Front Kick-Braces + Padded Crossbar Stop at [+1.05, 0, 3.65]!
    Out.push(...EmitTranslatedBox( 1.05, -1.55, 1.02, 0.56, 0.44, 3.10, CourseMaterial.Gingerbread));
    Out.push(...EmitTranslatedBox( 1.05,  1.55, 1.02, 0.56, 0.44, 3.10, CourseMaterial.Gingerbread));
    Out.push(...EmitOrientedBeam(  2.15, -1.55, 2.25, [-0.58, 0.0, 0.81], 3.10, 0.36, 0.36, CourseMaterial.WaferCrisp));
    Out.push(...EmitOrientedBeam(  2.15,  1.55, 2.25, [-0.58, 0.0, 0.81], 3.10, 0.36, 0.36, CourseMaterial.WaferCrisp));
    Out.push(...EmitTranslatedBox( 1.05,  0.0,  3.62, 0.66, 2.58, 0.52, CourseMaterial.PeppermintRed));
    // Rear Geared Torsion Winch Drum
    Out.push(...EmitTaperedCylinder(-2.65, 0.0, 1.28, "Y", 0.38, 0.38, 2.95, 10, CourseMaterial.Gold, CourseMaterial.LicoriceBlack, CourseMaterial.LicoriceBlack));
    // 4 Iron-Rimmed Peppermint Siege Wheels
    for (const WX of [-2.35, 2.25])
        for (const WY of [-1.92, 1.92])
            Out.push(...EmitTaperedCylinder(WX, WY, 0.76, "Y", 0.76, 0.76, 0.28, 12, CourseMaterial.LicoriceBlack, CourseMaterial.PeppermintRed, CourseMaterial.PeppermintRed));
    // Two Refractive Translucent Jelly Siege Crewmen manning the rear winch!
    for (const [SideY, Mat] of [[-2.45, CourseMaterial.GummyLime], [2.45, CourseMaterial.GummyCherry]])
    {
        Out.push(...EmitEllipsoid(-2.45, SideY, 0.98, 0.58, 0.54, 0.82, 6, 10, Mat));
        Out.push(...EmitEllipsoid(-2.45, SideY, 2.12, 0.44, 0.44, 0.44, 5, 10, Mat));
    }
    return Out;
}

// 📝 Heavy Catapult THROWING ARM + DEEP CUPPED BOWL (pivots cleanly at [0,0,0]; Bowl Center = [-4.35, 0.0, 0.36]!)
export function EmitCandyCatapultArmFacets()
{
    const Out = [];
    // Torsion Axle Drum at [0,0,0] + Tapered 4.6 m Throwing Beam along -X + Brass Reinforcing Bands!
    Out.push(...EmitTaperedCylinder( 0.0,   0.0, 0.0, "Y", 0.38, 0.38, 2.52, 10, CourseMaterial.LicoriceBlack, CourseMaterial.Gold, CourseMaterial.Gold));
    Out.push(...EmitTranslatedBox(  -2.05,  0.0, -0.20, 4.30, 0.42, 0.40, CourseMaterial.WaferCrisp));
    Out.push(...EmitTranslatedBox(  -1.10,  0.0, -0.24, 0.28, 0.50, 0.48, CourseMaterial.Gold));
    Out.push(...EmitTranslatedBox(  -3.10,  0.0, -0.24, 0.28, 0.50, 0.48, CourseMaterial.Gold));
    // Deep Cupped Throwing Spoon at [-4.35, 0.0, 0.0..0.68]: solid base + 8-wall raised rim surrounding [-4.35, 0, 0.45]!
    Out.push(...EmitTaperedCylinder(-4.35,  0.0, -0.02, "Z", 0.92, 1.08, 0.26, 10, CourseMaterial.Gold, CourseMaterial.Gingerbread, CourseMaterial.LicoriceBlack));
    for (let I = 0; I < 8; ++I)
    {
        const A = (I / 8) * Math.PI * 2.0;
        Out.push(...EmitTranslatedBox(-4.35 + Math.cos(A) * 0.96, Math.sin(A) * 0.96, 0.14, 0.34, 0.34, 0.52, CourseMaterial.Gingerbread));
    }
    return Out;
}

// 📝 Glowing Caramel-Fire Target Ring on the road showing exact parabolic landing zone of incoming Catapult Boulders!
export function EmitCandyTargetRingFacets()
{
    const Out = [];
    for (let I = 0; I < 12; ++I)
    {
        const A = (I / 12) * Math.PI * 2.0;
        Out.push(...EmitTranslatedBox(Math.cos(A) * 2.65, Math.sin(A) * 2.65, 0.04, 0.72, 0.72, 0.10, (I & 1) ? CourseMaterial.TrafficOrange : CourseMaterial.PeppermintRed));
    }
    Out.push(...EmitTaperedCylinder(0.0, 0.0, 0.06, "Z", 0.55, 0.42, 0.08, 10, CourseMaterial.TrafficYellow));
    return Out;
}

export function EmitCandyOldCannonFacets()
{
    const Out = [];
    Out.push(...EmitTranslatedBox(-0.35, -0.68, 0.42, 3.10, 0.28, 0.78, CourseMaterial.Gingerbread));
    Out.push(...EmitTranslatedBox(-0.35,  0.68, 0.42, 3.10, 0.28, 0.78, CourseMaterial.Gingerbread));
    Out.push(...EmitTranslatedBox(-0.85,  0.0,  0.48, 2.10, 1.04, 0.34, CourseMaterial.WaferCrisp));
    for (const WX of [-1.25, 0.75])
        for (const WY of [-0.95, 0.95])
            Out.push(...EmitTaperedCylinder(WX, WY, 0.56, "Y", 0.56, 0.56, 0.22, 12, CourseMaterial.LicoriceBlack, CourseMaterial.PeppermintRed, CourseMaterial.PeppermintRed));
    Out.push(...EmitTaperedCylinder( 0.85, 0.0, 1.38, "X", 0.54, 0.38, 3.85, 12, CourseMaterial.LicoriceBlack));
    Out.push(...EmitTaperedCylinder( 2.92, 0.0, 1.38, "X", 0.42, 0.52, 0.38, 12, CourseMaterial.Gold, CourseMaterial.LicoriceBlack, CourseMaterial.LicoriceBlack));
    Out.push(...EmitTaperedCylinder( 0.10, 0.0, 1.38, "X", 0.56, 0.56, 0.22, 12, CourseMaterial.Gold));
    Out.push(...EmitTaperedCylinder( 1.55, 0.0, 1.38, "X", 0.48, 0.48, 0.20, 12, CourseMaterial.Gold));
    Out.push(...EmitEllipsoid(-1.28, 0.0, 1.38, 0.28, 0.28, 0.28, 5, 8, CourseMaterial.Gold));
    return Out;
}

// 📝 Swinging Jawbreaker Wrecking-Ball Pendulum Arm (pivots around [0,0,0], hangs down -Z to ball center at Z = -6.4 m!)
export function EmitCandyPendulumArmFacets()
{
    const Out = [];
    Out.push(...EmitTaperedCylinder(0.0, 0.0,  0.0,  "X", 0.52, 0.52, 0.95, 10, CourseMaterial.Gold));
    Out.push(...EmitTaperedCylinder(0.0, 0.0, -3.15, "Z", 0.16, 0.18, 5.40,  8, CourseMaterial.LicoriceBlack));
    Out.push(...EmitEllipsoid(      0.0, 0.0, -6.45, 1.45, 1.45, 1.45, 8, 14, CourseMaterial.PeppermintRed, CourseMaterial.FrostingCream));
    return Out;
}

// 📝 Overhead Slamming Peppermint Crusher Mallet Head + Shaft!
export function EmitCandyCrusherHeadFacets()
{
    const Out = [];
    Out.push(...EmitTaperedCylinder(0.0, 0.0, 4.15, "Z", 0.42, 0.42, 4.80, 10, CourseMaterial.LicoriceBlack));
    Out.push(...EmitTranslatedBox(  0.0, 0.0, 0.32, 2.40, 7.20, 1.35, CourseMaterial.PeppermintRed));
    Out.push(...EmitTranslatedBox(  0.0, 0.0, 0.02, 2.55, 7.40, 0.26, CourseMaterial.Gold));
    return Out;
}

// 📝 Giant 3.6 m Rolling Peppermint Pinwheel Boulder (rolls across road about its X axis!)
export function EmitCandyPinwheelDiscFacets()
{
    const Out = [];
    Out.push(...EmitTaperedCylinder(0.0, 0.0, 0.0, "X", 1.82, 1.82, 0.92, 16, CourseMaterial.PeppermintRed, CourseMaterial.FrostingCream, CourseMaterial.FrostingCream));
    Out.push(...EmitTaperedCylinder(0.0, 0.0, 0.0, "X", 1.05, 1.05, 1.04, 12, CourseMaterial.PeppermintRed));
    Out.push(...EmitTaperedCylinder(0.0, 0.0, 0.0, "X", 0.42, 0.42, 1.16, 10, CourseMaterial.Gold));
    return Out;
}

// 📝 Erupting Cola-Mentos Geyser Foam Column (rises out of CandyGeyserVent!)
export function EmitCandyGeyserColumnFacets()
{
    const Out = [];
    Out.push(...EmitTaperedCylinder(0.0, 0.0, 3.6, "Z", 1.25, 2.15, 7.2, 12, CourseMaterial.FrostingCream));
    Out.push(...EmitEllipsoid(      0.0, 0.0, 7.5, 2.35, 2.35, 1.25, 6, 12, CourseMaterial.FrostingCream, CourseMaterial.CaramelSyrup));
    return Out;
}

export function EmitCandyFlamingGummyBallFacets()
{
    return EmitEllipsoid(0.0, 0.0, 0.0, 0.78, 0.78, 0.74, 7, 12, CourseMaterial.GummyOrange, CourseMaterial.GummyCherry);
}

export function EmitCandyJawbreakerFacets()
{
    return EmitEllipsoid(0.0, 0.0, 0.0, 0.50, 0.50, 0.50, 6, 12, CourseMaterial.PeppermintRed, CourseMaterial.FrostingCream);
}

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
    CandyWaterfallSpout: { Emit: EmitCandyWaterfallSpoutFacets,                                            Voxel: 0.24, Cards: 0, Distance: false },
    CandyBridgeLong:     { Emit: () => EmitCandyWaferBridgeFacets(34.0, 4.6, 1.05),                        Voxel: 0.28, Cards: 5 },
    CandyBridgeShort:    { Emit: () => EmitCandyWaferBridgeFacets(17.0, 5.5, 0.65),                        Voxel: 0.26, Cards: 5 },
    CandyPeppermintArch: { Emit: EmitCandyPeppermintArchFacets,                                            Voxel: 0.24, Cards: 6 },
    CandyPendulumGantry: { Emit: EmitCandyPendulumGantryFacets,                                            Voxel: 0.26, Cards: 5 },
    CandyCrusherFrame:   { Emit: EmitCandyCrusherFrameFacets,                                              Voxel: 0.24, Cards: 5 },
    CandyTaffyStrip:     { Emit: EmitCandyTaffyStripFacets,                                                Voxel: 0.18, Cards: 0, Distance: false },
    CandyGeyserVent:     { Emit: EmitCandyGeyserVentFacets,                                                Voxel: 0.16, Cards: 0, Distance: false },
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
    CandyCatapultBase:   { Emit: EmitCandyCatapultBaseFacets,                                              Voxel: 0.18, Cards: 0, Distance: false },
    CandyCatapultArm:    { Emit: EmitCandyCatapultArmFacets,                                               Voxel: 0.14, Cards: 0, Distance: false },
    CandyTargetRing:     { Emit: EmitCandyTargetRingFacets,                                                Voxel: 0.12, Cards: 0, Distance: false },
    CandyOldCannon:      { Emit: EmitCandyOldCannonFacets,                                                 Voxel: 0.16, Cards: 0, Distance: false },
    CandyFlamingBall:    { Emit: EmitCandyFlamingGummyBallFacets,                                          Voxel: 0.12, Cards: 0, Distance: false },
    CandyJawbreaker:     { Emit: EmitCandyJawbreakerFacets,                                                Voxel: 0.10, Cards: 0, Distance: false },
    CandyStickyPuddle:   { Emit: EmitCandyStickyPuddleFacets,                                              Voxel: 0.14, Cards: 0, Distance: false },
    CandyPendulumArm:    { Emit: EmitCandyPendulumArmFacets,                                               Voxel: 0.16, Cards: 0, Distance: false },
    CandyCrusherHead:    { Emit: EmitCandyCrusherHeadFacets,                                               Voxel: 0.16, Cards: 0, Distance: false },
    CandyPinwheelDisc:   { Emit: EmitCandyPinwheelDiscFacets,                                              Voxel: 0.16, Cards: 0, Distance: false },
    CandyGeyserColumn:   { Emit: EmitCandyGeyserColumnFacets,                                              Voxel: 0.16, Cards: 0, Distance: false }
});

export function ResolveCandyPlacements()
{
    const P = [];
    const Add = (Shape, Name, X, Y, Yaw = 0.0, Collider = true, ZLift = 0.0) =>
        P.push({ Shape, Name, Position: [X, Y, QueryCandyTerrainHeight(X, Y) + ZLift], Yaw, Collider });

    // ① Gingerbread Cottages, Clocktowers & Windmills
    Add("CandyPeppermintArch", "Start Peppermint Arch", -178.0, 0.0, 0.0, false);
    const CottageSpots = [
        [-192.0, -20.5,  0.12], [-192.0,  20.5, -0.12],
        [-162.0, -23.5,  0.22], [-162.0,  23.5, -0.22],
        [ -28.0, -31.0,  0.18], [ -28.0,  31.0, -0.18],
        [   6.0, -30.5, -0.14], [   6.0,  30.5,  0.14],
        [  68.0, -30.5,  0.20], [  68.0,  30.5, -0.20],
        [ 104.0, -30.5, -0.15], [ 104.0,  30.5,  0.15]
    ];
    CottageSpots.forEach(([X, Y, Yaw], I) => Add("CandyCottage", `Gingerbread Cottage ${I + 1}`, X, Y, Yaw, true));

    Add("CandyClockTower", "South Peppermint Clocktower", -142.0, -31.5,  0.30, true);
    Add("CandyClockTower", "North Peppermint Clocktower",  124.0,  31.5, -0.30, true);
    Add("CandyWindmill",   "Lagoon Overlook Windmill",     -86.0, -40.0,  1.25, true);
    Add("CandyWindmill",   "Caramel Ridge Windmill",        42.0,  40.0, -1.25, true);

    // ② 3 Giant Hillside Fizzy Soda-Bottle Waterfalls feeding the 2.5D Waterways!
    CandyWaterfallSites.forEach((W, I) => Add("CandyWaterfallSpout", `Soda Waterfall ${I + 1}`, W.Pos[0], W.Pos[1], W.Yaw, false, -0.4));

    // ③ Wafer Arch Bridges
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

    // ④ Pendulum Gantries, Crusher Frames, Taffy Snare Strips & Cola-Mentos Geyser Vents!
    CandyPendulumSites.forEach((S, I) =>
    {
        const BaseZ = I < 2
            ? QueryCandyTerrainHeight(CandyWaferBridges[I].CX - CandyWaferBridges[I].HalfRun, S.Pos[1]) + CandyWaferBridges[I].DeckLift
            : QueryCandyTerrainHeight(S.Pos[0], S.Pos[1]);
        P.push({ Shape: "CandyPendulumGantry", Name: `Pendulum Gantry ${I + 1}`, Position: [S.Pos[0], S.Pos[1], BaseZ], Yaw: 0.0, Collider: false });
    });
    CandyCrusherSites.forEach((S, I) => Add("CandyCrusherFrame", `Crusher Frame ${I + 1}`, S.Pos[0], S.Pos[1], 0.0, false));
    CandyTaffyStrips.forEach((S, I)  => Add("CandyTaffyStrip",   `Taffy Snare ${I + 1}`,   S.Pos[0], S.Pos[1], 0.0, false, -0.02));
    CandyGeyserSites.forEach((S, I)  => Add("CandyGeyserVent",   `Cola Geyser ${I + 1}`,   S.Pos[0], S.Pos[1], 0.0, false, -0.02));

    // ⑤ Refractive Jelly Bumpers & Lollipop Trees
    const BumperShapes = {
        [CourseMaterial.GummyCherry]: "CandyBumperCherry",
        [CourseMaterial.GummyLime]:   "CandyBumperLime",
        [CourseMaterial.GummyOrange]: "CandyBumperOrange",
        [CourseMaterial.GummyBerry]:  "CandyBumperBerry"
    };
    CandyGummyBumpers.forEach((B, I) => Add(BumperShapes[B.Mat], `Jelly Bumper ${I + 1}`, B.Pos[0], B.Pos[1], 0.0, false, -0.05));

    const TreeCoords = [
        [-175.0, -13.5], [-175.0, 13.5], [-148.0, -14.0], [-148.0, 14.0],
        [ -42.0, -24.5], [ -42.0, 24.5], [  18.0, -22.0], [  18.0, 22.0],
        [  78.0, -21.5], [  78.0, 21.5], [ 122.0, -20.5], [ 122.0, 20.5]
    ];
    TreeCoords.forEach(([X, Y], I) => Add((I & 1) ? "CandyTreeLime" : "CandyTreeCherry", `Lollipop Tree ${I + 1}`, X, Y, I * 0.6, false));

    // ⑥ Grand Gingerbread Citadel Wall & Sweet-Gate Archway!
    Add("CandyCitadelGate", "Grand Citadel Sweet-Gate", 188.0, 0.0, 0.0, false);
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
    const Panes = [
        { Name: "Peppermint Arch Sugar-Glass", Mat: "tempered", Extent: [0.35, 4.4, 2.5], Pos: [-178.0,  0.0] },
        { Name: "Crossroads Sugar-Glass Wall", Mat: "tempered", Extent: [0.35, 4.6, 2.5], Pos: [  -4.0,  0.0] },
        { Name: "Siege Arch Sugar-Glass Wall", Mat: "tempered", Extent: [0.35, 4.6, 2.5], Pos: [  86.0,  0.0] },
        { Name: "South Bridge Wafer Roadblock",Mat: "wood",     Extent: [1.35, 2.4, 1.3], Pos: [ -66.0,-21.5] },
        { Name: "North Bridge Wafer Roadblock",Mat: "wood",     Extent: [1.35, 2.4, 1.3], Pos: [ -66.0, 21.5] },
        { Name: "Sweet-Gate Sugar Crystal",    Mat: "glass",    Extent: [0.45, 5.2, 2.6], Pos: [ 184.0,  0.0] }
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

function PickCandyGroundMaterial(X, Y, Z)
{
    const Carve = QueryCandyBasinCarve(X, Y);
    if (Carve > 0.40)
    {
        // Colorful submerged Peppermint & Wafer riverbed pebbles visible through the refractive 2.5D water!
        return ((Math.floor(X * 0.25) + Math.floor(Y * 0.25)) & 3) === 0 ? CourseMaterial.PeppermintRed : CourseMaterial.WaferCrisp;
    }
    if (Carve > 0.12)
        return CourseMaterial.FrostingCream;

    if (Math.abs(Y) > 31.5 || Z > 3.6)
        return CourseMaterial.FrostingCream;

    const LaneCenterY    = 12.5 * Math.sin(X * 0.032);
    const DistToLane     = Math.abs(Y - LaneCenterY);
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
    { Name: "Waffle Square · Crusher & Taffy", Position: [-198.0,   0.0], Yaw: 0.0, Note: "Dodge Crusher #1 & Taffy Snare!" },
    { Name: "2.5D Refractive Soda Lagoon",     Position: [-130.0,   0.0], Yaw: 0.0, Note: "Refractive 2.5D waves & Pendulum Bridges" },
    { Name: "Jelly-Worm & Pinwheel S-Bends",   Position: [ -32.0,   0.0], Yaw: 0.0, Note: "Skinned Jelly Worms & Rolling Pinwheels!" },
    { Name: "Onager Catapult & Cannon Ridge",  Position: [  58.0,   0.0], Yaw: 0.0, Note: "Parabolic Flaming Boulders & Cola Geysers" },
    { Name: "Grand Citadel Sweet-Gate",        Position: [ 168.0,   0.0], Yaw: 0.0, Note: "Beat the final Crusher & Moat Pendulum!" }
]);

export const CandyGoalX = 186.0;
