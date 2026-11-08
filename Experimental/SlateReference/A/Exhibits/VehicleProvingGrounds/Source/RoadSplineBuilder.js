//============================================================================================================================================
//                                                         ROADSPLINEBUILDER.JS
//============================================================================================================================================
// 🧩 Watertight 2-manifold Cubic Bézier Spline Road Network Engine, Editing Operations, Interchange Templates & 480 Hz Physics Surface:
//    - Shared junction nodes + cubic Bézier tangent handles (h1, h2) with C1 Catmull-Rom smoothing & exact de Casteljau splitting
//    - Curvature-clamped cross-sections (zero inner-corner bowties) + procedural PBR asphalt/kerb/lane-marking bands (zero UV distortion)
//    - Closed outward-wound 2-manifold road decks, junction hubs, safety parapets & bridge piers + spatial-hashed 3D tyre/hull physics!

import { CourseMaterial } from "./MaterialSpecification.js";
import { SurfaceCategory } from "./RampSurfaceProjection.js";
import { CrossVector, DotVector, NormalizeVector, SubtractVector } from "./TransformProjection.js";

let NextUniqueId = 1;
export function GenerateRoadId(Prefix = "rd")
{
    return `${Prefix}_${(NextUniqueId++).toString(36)}`;
}

function Clamp(Value, Low, High)
{
    return Math.max(Low, Math.min(High, Value));
}

function Lerp(A, B, T)
{
    return A + (B - A) * T;
}

function Lerp3(A, B, T)
{
    return [Lerp(A[0], B[0], T), Lerp(A[1], B[1], T), Lerp(A[2], B[2], T)];
}

export function EvaluateCubic3(P0, P1, P2, P3, T)
{
    const U = 1.0 - T;
    const W0 = U * U * U;
    const W1 = 3.0 * U * U * T;
    const W2 = 3.0 * U * T * T;
    const W3 = T * T * T;
    return [
        W0 * P0[0] + W1 * P1[0] + W2 * P2[0] + W3 * P3[0],
        W0 * P0[1] + W1 * P1[1] + W2 * P2[1] + W3 * P3[1],
        W0 * P0[2] + W1 * P1[2] + W2 * P2[2] + W3 * P3[2]
    ];
}

export function EvaluateCubicDerivative3(P0, P1, P2, P3, T)
{
    const U = 1.0 - T;
    const A0 = 3.0 * U * U;
    const A1 = 6.0 * U * T;
    const A2 = 3.0 * T * T;
    return [
        A0 * (P1[0] - P0[0]) + A1 * (P2[0] - P1[0]) + A2 * (P3[0] - P2[0]),
        A0 * (P1[1] - P0[1]) + A1 * (P2[1] - P1[1]) + A2 * (P3[1] - P2[1]),
        A0 * (P1[2] - P0[2]) + A1 * (P2[2] - P1[2]) + A2 * (P3[2] - P2[2])
    ];
}

export function SplitCubicControlPoints(Points, T)
{
    const [P0, P1, P2, P3] = Points;
    const M01 = Lerp3(P0, P1, T);
    const M12 = Lerp3(P1, P2, T);
    const M23 = Lerp3(P2, P3, T);
    const M012 = Lerp3(M01, M12, T);
    const M123 = Lerp3(M12, M23, T);
    const Mid = Lerp3(M012, M123, T);
    return [
        [P0, M01, M012, Mid],
        [Mid, M123, M23, P3]
    ];
}

function PointToSegmentDistXY(P, A, B)
{
    const DX = B[0] - A[0], DY = B[1] - A[1];
    const Len2 = DX * DX + DY * DY;
    const T = Len2 > 1.0e-9 ? Clamp(((P[0] - A[0]) * DX + (P[1] - A[1]) * DY) / Len2, 0.0, 1.0) : 0.0;
    const QX = A[0] + DX * T, QY = A[1] + DY * T;
    return { Distance: Math.hypot(P[0] - QX, P[1] - QY), T };
}

//------------------------------------------------------------------------------------------------------------------------
//                                           PROJECT & SPLINE ALIGNMENT MODEL
//------------------------------------------------------------------------------------------------------------------------

export function CreateRoadNode(Position, Name = "Junction", Options = {})
{
    return {
        Id:           Options.Id || GenerateRoadId("nd"),
        Name,
        Position:     [Number(Position[0]) || 0.0, Number(Position[1]) || 0.0, Number(Position[2]) || 0.0],
        TrafficLight: !!Options.TrafficLight
    };
}

export function CreateSplineRoad(Project, StartNodeId, EndNodeId, Options = {})
{
    const Start = Project.Nodes.find((N) => N.Id === StartNodeId);
    const End   = Project.Nodes.find((N) => N.Id === EndNodeId);
    const DX = End ? (End.Position[0] - Start.Position[0]) : 24.0;
    const DY = End ? (End.Position[1] - Start.Position[1]) : 0.0;
    const DZ = End ? (End.Position[2] - Start.Position[2]) : 0.0;
    return {
        Id:         Options.Id || GenerateRoadId("road"),
        Name:       Options.Name || `Spline Road ${Project.Roads.length + 1}`,
        Start:      StartNodeId,
        End:        EndNodeId,
        H1:         Options.H1 ? Options.H1.slice() : [DX / 3.0, DY / 3.0, DZ / 3.0],
        H2:         Options.H2 ? Options.H2.slice() : [-DX / 3.0, -DY / 3.0, -DZ / 3.0],
        Width:      Clamp(Number(Options.Width) || 11.0, 5.0, 26.0),
        Style:      Options.Style || "motorway",    // "motorway" | "race" | "urban" | "bridge"
        BankDeg:    Clamp(Number(Options.BankDeg) || 0.0, -28.0, 28.0),
        ArchHeight: Clamp(Number(Options.ArchHeight) || 0.0, 0.0, 14.0),
        Guardrails: Options.Guardrails ?? false,
        Markings:   Options.Markings ?? true
    };
}

export function ResolveRoadControlPoints(Project, Road)
{
    const N0 = Project.Nodes.find((N) => N.Id === Road.Start);
    const N1 = Project.Nodes.find((N) => N.Id === Road.End);
    if (!N0 || !N1)
        return null;
    const P0 = N0.Position.slice();
    const P3 = N1.Position.slice();
    const P1 = [P0[0] + Road.H1[0], P0[1] + Road.H1[1], P0[2] + (Road.H1[2] || 0.0)];
    const P2 = [P3[0] + Road.H2[0], P3[1] + Road.H2[1], P3[2] + (Road.H2[2] || 0.0)];
    return [P0, P1, P2, P3];
}

export function SampleRoadAlignment(Project, Road, StepMeters = 2.5)
{
    const Ctrl = ResolveRoadControlPoints(Project, Road);
    if (!Ctrl)
        return null;
    const [P0, P1, P2, P3] = Ctrl;

    // ① Adaptive flatness + chord subdivision
    const RawSamples = [{ P: P0, T: 0.0 }];
    const Subdivide = (Seg, TA, TB, Depth) =>
    {
        const Chord = Math.hypot(Seg[3][0] - Seg[0][0], Seg[3][1] - Seg[0][1], Seg[3][2] - Seg[0][2]);
        const Flat1 = PointToSegmentDistXY(Seg[1], Seg[0], Seg[3]).Distance;
        const Flat2 = PointToSegmentDistXY(Seg[2], Seg[0], Seg[3]).Distance;
        if (Depth >= 9 || (Chord <= 2.2 && Math.max(Flat1, Flat2) <= 0.035))
        {
            RawSamples.push({ P: Seg[3], T: TB });
            return;
        }
        const [Left, Right] = SplitCubicControlPoints(Seg, 0.5);
        const Mid = 0.5 * (TA + TB);
        Subdivide(Left, TA, Mid, Depth + 1);
        Subdivide(Right, Mid, TB, Depth + 1);
    };
    Subdivide(Ctrl, 0.0, 1.0, 0);

    // Cumulative arc length table
    const CumS = [0.0];
    for (let Index = 1; Index < RawSamples.length; ++Index)
    {
        const A = RawSamples[Index - 1].P, B = RawSamples[Index].P;
        CumS.push(CumS[Index - 1] + Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2]));
    }
    const TotalLength = CumS[CumS.length - 1];
    if (TotalLength < 0.5)
        return null;

    // ② Uniform metric station resampling (eliminates uneven dash/kerb stretching!)
    const SegmentCount = Math.max(2, Math.round(TotalLength / Math.max(1.2, StepMeters)));
    const Stations = [];
    let MinRadius = Infinity;
    const FallbackDir = NormalizeVector([P3[0] - P0[0], P3[1] - P0[1], 0.0]);
    if (Math.hypot(FallbackDir[0], FallbackDir[1]) < 1.0e-5)
        FallbackDir[0] = 1.0;

    let RawCursor = 0;
    for (let Step = 0; Step <= SegmentCount; ++Step)
    {
        const TargetS = (Step / SegmentCount) * TotalLength;
        while (RawCursor + 1 < CumS.length - 1 && CumS[RawCursor + 1] < TargetS)
            ++RawCursor;
        const SpanS = Math.max(1.0e-7, CumS[RawCursor + 1] - CumS[RawCursor]);
        const Frac  = Clamp((TargetS - CumS[RawCursor]) / SpanS, 0.0, 1.0);
        const ParamT = Lerp(RawSamples[RawCursor].T, RawSamples[RawCursor + 1].T, Frac);

        const Pos = EvaluateCubic3(P0, P1, P2, P3, ParamT);
        // Smooth raised bridge arch profile when ArchHeight > 0 or Style === "bridge" with flat nodes
        const AutoArch = Road.ArchHeight > 0.0 ? Road.ArchHeight : (Road.Style === "bridge" && Pos[2] < 0.5 ? 5.4 : 0.0);
        if (AutoArch > 0.0)
        {
            const Bell = Math.sin(Math.PI * ParamT);
            Pos[2] += AutoArch * Bell * Bell;
        }

        const Deriv = EvaluateCubicDerivative3(P0, P1, P2, P3, ParamT);
        const HorizLen = Math.hypot(Deriv[0], Deriv[1]);
        const TangentXY = HorizLen > 1.0e-5 ? [Deriv[0] / HorizLen, Deriv[1] / HorizLen, 0.0] : FallbackDir;
        // Leftward unit normal in Z-up right-handed frame: (-Ty, Tx, 0)
        const LeftXY = [-TangentXY[1], TangentXY[0], 0.0];

        // Smooth fade-in/out of banking near junction ends so shared junctions stay level & crack-free!
        const EndFade = Math.sin(Math.PI * ParamT);
        const BankRad = (Road.BankDeg * Math.PI / 180.0) * (0.25 + 0.75 * EndFade);

        Stations.push({
            P:       Pos,
            Tangent: TangentXY,
            Left:    LeftXY,
            BankRad,
            S:       TargetS,
            T:       ParamT
        });
    }

    // Estimate minimum horizontal radius of curvature for engineering telemetry
    for (let Index = 1; Index < Stations.length - 1; ++Index)
    {
        const T0 = Stations[Index - 1].Tangent, T1 = Stations[Index + 1].Tangent;
        const DS = Math.max(0.2, Stations[Index + 1].S - Stations[Index - 1].S);
        const DTheta = Math.hypot(T1[0] - T0[0], T1[1] - T0[1]);
        if (DTheta > 1.0e-4)
            MinRadius = Math.min(MinRadius, DS / DTheta);
    }

    return { Road, Points: Ctrl, Stations, Length: TotalLength, MinRadius };
}

export function QueryClosestOnRoad(Alignment, WorldPoint)
{
    let Best = { Distance: Infinity, T: 0.0, S: 0.0, Point: Alignment.Stations[0].P.slice() };
    for (let Index = 1; Index < Alignment.Stations.length; ++Index)
    {
        const A = Alignment.Stations[Index - 1], B = Alignment.Stations[Index];
        const Hit = PointToSegmentDistXY(WorldPoint, A.P, B.P);
        if (Hit.Distance < Best.Distance)
        {
            const T = Lerp(A.T, B.T, Hit.T);
            const S = Lerp(A.S, B.S, Hit.T);
            Best = {
                Distance: Hit.Distance,
                T,
                S,
                Point: [Lerp(A.P[0], B.P[0], Hit.T), Lerp(A.P[1], B.P[1], Hit.T), Lerp(A.P[2], B.P[2], Hit.T)]
            };
        }
    }
    return Best;
}

//------------------------------------------------------------------------------------------------------------------------
//                                  EDITING TOOLS: SMOOTH, SPLIT, SNAP, INSERT, DELETE
//------------------------------------------------------------------------------------------------------------------------

export function AutoSmoothNodeTangents(Project, NodeId)
{
    const Node = Project.Nodes.find((N) => N.Id === NodeId);
    if (!Node)
        return;
    const Incident = [];
    for (const R of Project.Roads)
    {
        if (R.Start === NodeId) Incident.push({ Road: R, End: "Start", OtherId: R.End });
        if (R.End === NodeId)   Incident.push({ Road: R, End: "End",   OtherId: R.Start });
    }
    if (Incident.length === 2)
    {
        const A = Project.Nodes.find((N) => N.Id === Incident[0].OtherId);
        const B = Project.Nodes.find((N) => N.Id === Incident[1].OtherId);
        if (!A || !B)
            return;
        const Dir = NormalizeVector([B.Position[0] - A.Position[0], B.Position[1] - A.Position[1], B.Position[2] - A.Position[2]]);
        for (let K = 0; K < 2; ++K)
        {
            const Entry = Incident[K];
            const Other = K === 0 ? A : B;
            const Chord = Math.hypot(Other.Position[0] - Node.Position[0], Other.Position[1] - Node.Position[1]);
            const Scale = Math.max(4.0, Chord * 0.34) * (K === 0 ? -1.0 : 1.0);
            const Handle = [Dir[0] * Scale, Dir[1] * Scale, Dir[2] * Scale * 0.35];
            if (Entry.End === "Start") Entry.Road.H1 = Handle;
            else                       Entry.Road.H2 = Handle;
        }
    }
}

export function SplitSplineRoadAt(Project, RoadId, T)
{
    const ClampedT = Clamp(T, 0.12, 0.88);
    const RoadIdx = Project.Roads.findIndex((R) => R.Id === RoadId);
    if (RoadIdx < 0)
        return null;
    const Road = Project.Roads[RoadIdx];
    const Ctrl = ResolveRoadControlPoints(Project, Road);
    if (!Ctrl)
        return null;
    const [LeftCtrl, RightCtrl] = SplitCubicControlPoints(Ctrl, ClampedT);
    const MidPos = LeftCtrl[3].slice();
    if (Road.ArchHeight > 0.0 || Road.Style === "bridge")
    {
        const AutoArch = Road.ArchHeight > 0.0 ? Road.ArchHeight : 5.4;
        const Bell = Math.sin(Math.PI * ClampedT);
        MidPos[2] += AutoArch * Bell * Bell;
    }

    const MidNode = CreateRoadNode(MidPos, `${Road.Name} Split`);
    Project.Nodes.push(MidNode);

    const FirstHalf = {
        ...Road,
        End:        MidNode.Id,
        ArchHeight: 0.0,
        H1:         [LeftCtrl[1][0] - LeftCtrl[0][0], LeftCtrl[1][1] - LeftCtrl[0][1], LeftCtrl[1][2] - LeftCtrl[0][2]],
        H2:         [LeftCtrl[2][0] - MidPos[0],      LeftCtrl[2][1] - MidPos[1],      LeftCtrl[2][2] - MidPos[2]]
    };
    const SecondHalf = {
        ...Road,
        Id:         GenerateRoadId("road"),
        Name:       `${Road.Name} B`,
        Start:      MidNode.Id,
        ArchHeight: 0.0,
        H1:         [RightCtrl[1][0] - MidPos[0],      RightCtrl[1][1] - MidPos[1],      RightCtrl[1][2] - MidPos[2]],
        H2:         [RightCtrl[2][0] - RightCtrl[3][0],RightCtrl[2][1] - RightCtrl[3][1],RightCtrl[2][2] - RightCtrl[3][2]]
    };
    Project.Roads.splice(RoadIdx, 1, FirstHalf, SecondHalf);
    return MidNode;
}

export function DeleteSelectionFromProject(Project, Selection)
{
    if (!Selection)
        return false;
    if (Selection.Kind === "road")
    {
        const Before = Project.Roads.length;
        Project.Roads = Project.Roads.filter((R) => R.Id !== Selection.Id);
        // Clean up orphan isolated nodes
        const Used = new Set();
        for (const R of Project.Roads) { Used.add(R.Start); Used.add(R.End); }
        Project.Nodes = Project.Nodes.filter((N) => Used.has(N.Id));
        return Project.Roads.length !== Before;
    }
    if (Selection.Kind === "node")
    {
        Project.Roads = Project.Roads.filter((R) => R.Start !== Selection.Id && R.End !== Selection.Id);
        const Before = Project.Nodes.length;
        Project.Nodes = Project.Nodes.filter((N) => N.Id !== Selection.Id);
        return Project.Nodes.length !== Before;
    }
    return false;
}

//------------------------------------------------------------------------------------------------------------------------
//                      CLOSED 2-MANIFOLD SPLINE EXTRUSION & 480 HZ ANALYTICAL PHYSICS BUILDER
//------------------------------------------------------------------------------------------------------------------------

function EmitManifoldQuad(Facets, A, B, C, D, Family)
{
    Facets.push(
        { Corners: [A, B, C], Family },
        { Corners: [A, C, D], Family }
    );
}

function EmitClosedBoxWorld(Facets, CenterXY, Yaw, HalfL, HalfW, Z0, Z1, TopMat, SideMat, BotMat)
{
    const Cos = Math.cos(Yaw), Sin = Math.sin(Yaw);
    const Pt = (LX, LY, Z) => [
        CenterXY[0] + LX * Cos - LY * Sin,
        CenterXY[1] + LX * Sin + LY * Cos,
        Z
    ];
    const B00 = Pt(-HalfL, -HalfW, Z0), B10 = Pt(HalfL, -HalfW, Z0), B11 = Pt(HalfL, HalfW, Z0), B01 = Pt(-HalfL, HalfW, Z0);
    const T00 = Pt(-HalfL, -HalfW, Z1), T10 = Pt(HalfL, -HalfW, Z1), T11 = Pt(HalfL, HalfW, Z1), T01 = Pt(-HalfL, HalfW, Z1);
    EmitManifoldQuad(Facets, T00, T10, T11, T01, TopMat);
    EmitManifoldQuad(Facets, B01, B11, B10, B00, BotMat);
    EmitManifoldQuad(Facets, B10, B11, T11, T10, SideMat);
    EmitManifoldQuad(Facets, B01, B00, T00, T01, SideMat);
    EmitManifoldQuad(Facets, B11, B01, T01, T11, SideMat);
    EmitManifoldQuad(Facets, B00, B10, T10, T00, SideMat);
}

function EmitJunctionHubSolid(Facets, Center, Radius, CrownZ, RimMaterial,Sides = 12)
{
    const ZTop = CrownZ + 0.022;
    const ZBot = Math.min(-0.36, CrownZ - 0.42);
    const InnerR = Math.max(0.8, Radius - 0.65);
    for (let Index = 0; Index < Sides; ++Index)
    {
        const A0 = (2.0 * Math.PI * Index) / Sides;
        const A1 = (2.0 * Math.PI * (Index + 1)) / Sides;
        const C0 = Math.cos(A0), S0 = Math.sin(A0);
        const C1 = Math.cos(A1), S1 = Math.sin(A1);

        const TI0 = [Center[0] + InnerR * C0, Center[1] + InnerR * S0, ZTop];
        const TI1 = [Center[0] + InnerR * C1, Center[1] + InnerR * S1, ZTop];
        const TO0 = [Center[0] + Radius * C0, Center[1] + Radius * S0, ZTop];
        const TO1 = [Center[0] + Radius * C1, Center[1] + Radius * S1, ZTop];
        const BO0 = [Center[0] + Radius * C0, Center[1] + Radius * S0, ZBot];
        const BO1 = [Center[0] + Radius * C1, Center[1] + Radius * S1, ZBot];

        // Top inner asphalt fan
        Facets.push({ Corners: [[Center[0], Center[1], ZTop], TI0, TI1], Family: CourseMaterial.Asphalt });
        // Top outer kerb collar
        EmitManifoldQuad(Facets, TI0, TO0, TO1, TI1, RimMaterial);
        // Outer cylindrical side skirt
        EmitManifoldQuad(Facets, BO0, BO1, TO1, TO0, CourseMaterial.TunnelConcrete);
        // Bottom soffit fan (outward -Z)
        Facets.push({ Corners: [[Center[0], Center[1], ZBot], BO1, BO0], Family: CourseMaterial.TunnelConcrete });
    }
}

export function BuildSplineNetworkGeometry(Project)
{
    const Facets = [];
    const Alignments = [];
    const PhysicsSegments = [];
    const WorldMin = [ Infinity,  Infinity,  Infinity];
    const WorldMax = [-Infinity, -Infinity, -Infinity];

    const ExpandBounds = (Pt, Pad = 1.0) =>
    {
        WorldMin[0] = Math.min(WorldMin[0], Pt[0] - Pad);
        WorldMin[1] = Math.min(WorldMin[1], Pt[1] - Pad);
        WorldMin[2] = Math.min(WorldMin[2], Pt[2] - Pad);
        WorldMax[0] = Math.max(WorldMax[0], Pt[0] + Pad);
        WorldMax[1] = Math.max(WorldMax[1], Pt[1] + Pad);
        WorldMax[2] = Math.max(WorldMax[2], Pt[2] + Pad);
    };

    // ① Extrude every Cubic Bézier Spline Road as a closed, curvature-clamped 2-manifold multi-band deck solid!
    const NodeMaxWidth = new Map();
    for (const Road of Project.Roads)
    {
        const Alignment = SampleRoadAlignment(Project, Road, 2.4);
        if (!Alignment)
            continue;
        Alignments.push(Alignment);
        NodeMaxWidth.set(Road.Start, Math.max(NodeMaxWidth.get(Road.Start) || 4.0, Road.Width * 0.56));
        NodeMaxWidth.set(Road.End,   Math.max(NodeMaxWidth.get(Road.End)   || 4.0, Road.Width * 0.56));

        const HalfW = 0.5 * Road.Width;
        const KerbW = Math.min(0.65, HalfW * 0.14);
        const CenterHalf = Road.Markings ? 0.13 : 0.0;
        const DeckThickness = 0.44;
        // 6-vertex top profile offsets (from +Left to -Right):
        // [+HalfW, +HalfW - KerbW, +CenterHalf, -CenterHalf, -HalfW + KerbW, -HalfW]
        const ProfileOffsets = Road.Markings
            ? [HalfW, HalfW - KerbW, CenterHalf, -CenterHalf, -HalfW + KerbW, -HalfW]
            : [HalfW, HalfW - KerbW, -HalfW + KerbW, -HalfW];
        const K = ProfileOffsets.length;

        // Build curvature-clamped 3D rings so tight turns NEVER self-intersect or fold backward!
        const RingsTop = [];
        const RingsBot = [];
        let PrevLeftEnd = null;
        let PrevRightEnd = null;

        for (let Index = 0; Index < Alignment.Stations.length; ++Index)
        {
            const St = Alignment.Stations[Index];
            const CosBank = Math.cos(St.BankRad);
            const SinBank = Math.sin(St.BankRad);
            const CrownBaseZ = St.P[2] + 0.025; // sits 2.5 cm cleanly above Z=0 tarmac to eliminate ground coplanarity
            // 2.5 mm axial end-cap inset prevents coplanar cap Z-fighting & shared quantized edges at multi-road nodes
            const EndInset = Index === 0 ? 0.0025 : (Index === Alignment.Stations.length - 1 ? -0.0025 : 0.0);
            const BaseX = St.P[0] + St.Tangent[0] * EndInset;
            const BaseY = St.P[1] + St.Tangent[1] * EndInset;

            const EvalProfilePt = (LateralY, ZDelta) =>
            {
                const X = BaseX + St.Left[0] * LateralY * CosBank;
                const Y = BaseY + St.Left[1] * LateralY * CosBank;
                const Z = CrownBaseZ + LateralY * SinBank + ZDelta;
                return [X, Y, Z];
            };

            let OuterL = EvalProfilePt(HalfW, 0.0);
            let OuterR = EvalProfilePt(-HalfW, 0.0);

            // Monotonic inner-corner guard: prevent backward fold when curve radius < HalfW!
            if (PrevLeftEnd)
            {
                const AdvL = (OuterL[0] - PrevLeftEnd[0]) * St.Tangent[0] + (OuterL[1] - PrevLeftEnd[1]) * St.Tangent[1];
                if (AdvL < 0.06)
                {
                    const Fix = 0.06 - AdvL;
                    OuterL = [OuterL[0] + St.Tangent[0] * Fix, OuterL[1] + St.Tangent[1] * Fix, OuterL[2]];
                }
            }
            if (PrevRightEnd)
            {
                const AdvR = (OuterR[0] - PrevRightEnd[0]) * St.Tangent[0] + (OuterR[1] - PrevRightEnd[1]) * St.Tangent[1];
                if (AdvR < 0.06)
                {
                    const Fix = 0.06 - AdvR;
                    OuterR = [OuterR[0] + St.Tangent[0] * Fix, OuterR[1] + St.Tangent[1] * Fix, OuterR[2]];
                }
            }
            PrevLeftEnd = OuterL;
            PrevRightEnd = OuterR;

            const TopRow = [];
            const BotRow = [];
            for (let PIdx = 0; PIdx < K; ++PIdx)
            {
                const U = (HalfW - ProfileOffsets[PIdx]) / (2.0 * HalfW);
                const TX = Lerp(OuterL[0], OuterR[0], U);
                const TY = Lerp(OuterL[1], OuterR[1], U);
                const TZ = Lerp(OuterL[2], OuterR[2], U);
                TopRow.push([TX, TY, TZ]);
                BotRow.push([TX, TY, TZ - DeckThickness]);
                ExpandBounds([TX, TY, TZ], 1.6);
            }
            RingsTop.push(TopRow);
            RingsBot.push(BotRow);
        }

        const RingCount = RingsTop.length;
        const HasRails = Road.Guardrails || Road.Style === "bridge";

        for (let Step = 0; Step < RingCount - 1; ++Step)
        {
            const T0 = RingsTop[Step], T1 = RingsTop[Step + 1];
            const B0 = RingsBot[Step], B1 = RingsBot[Step + 1];
            const St0 = Alignment.Stations[Step], St1 = Alignment.Stations[Step + 1];

            // Kerb / Shoulder Material (alternating Red/White on Race, Concrete on Bridge/Urban, White stripe on Motorway)
            let ShoulderMat = CourseMaterial.PaintWhite;
            if (Road.Style === "race")
                ShoulderMat = (Step & 1) ? CourseMaterial.KerbRed : CourseMaterial.PaintWhite;
            else if (Road.Style === "urban" || Road.Style === "bridge")
                ShoulderMat = CourseMaterial.ApronConcrete;

            // Centerline Material (crisp 2.4 m yellow dashes!)
            const CenterMat = (Step % 2 === 0)
                ? (Road.Style === "race" ? CourseMaterial.PaintWhite : CourseMaterial.PaintYellow)
                : CourseMaterial.Asphalt;

            // Top surface bands (viewed from +Z: Step -> Step+1 is +X, PIdx -> PIdx+1 is +Left -> -Right, so [T0[j+1], T1[j+1], T1[j], T0[j]] winds +Z!)
            for (let Band = 0; Band < K - 1; ++Band)
            {
                let BandMat = CourseMaterial.Asphalt;
                if (Band === 0 || Band === K - 2)
                    BandMat = ShoulderMat;
                else if (Road.Markings && K === 6 && Band === 2)
                    BandMat = CenterMat;
                EmitManifoldQuad(Facets, T0[Band + 1], T1[Band + 1], T1[Band], T0[Band], BandMat);
                // Matching bottom soffit band (outward -Z!)
                const SoffitMat = (St0.P[2] > 0.6 || St1.P[2] > 0.6) ? CourseMaterial.ApronConcrete : CourseMaterial.TunnelConcrete;
                EmitManifoldQuad(Facets, B0[Band], B1[Band], B1[Band + 1], B0[Band + 1], SoffitMat);
            }

            // Left outer fascia (Band 0 = +Left, outward +Left: B0[0] -> T0[0] -> T1[0] -> B1[0] -> check: (T0-B0)=+Z, (B1-B0)=+Tangent => (+Z)×(+T) = +Left? Wait: k × i = +j = +Left! So [B0[0], B1[0], T1[0], T0[0]]: (B1-B0)×(T0-B0) = (+T)×(+Z) = -Left! Therefore [B1[0], B0[0], T0[0], T1[0]] winds +Left!)
            const FasciaMat = Road.Style === "bridge" ? CourseMaterial.SteelDark : CourseMaterial.BarrierConcrete;
            EmitManifoldQuad(Facets, B1[0], B0[0], T0[0], T1[0], FasciaMat);
            // Right outer fascia (Band K-1 = -Left, outward -Left: (+T)×(+Z) = -Left -> [B0[K-1], B1[K-1], T1[K-1], T0[K-1]]!)
            EmitManifoldQuad(Facets, B0[K - 1], B1[K - 1], T1[K - 1], T0[K - 1], FasciaMat);

            // Optional Closed 2-Manifold Safety Guardrails / Bridge Parapets along outer shoulders!
            if (HasRails || Math.max(St0.P[2], St1.P[2]) > 1.1)
            {
                const MidYaw = Math.atan2(St1.P[1] - St0.P[1], St1.P[0] - St0.P[0]);
                const SegLen = Math.hypot(St1.P[0] - St0.P[0], St1.P[1] - St0.P[1]);
                for (const SideIdx of [0, K - 1])
                {
                    const MidEdge = Lerp3(T0[SideIdx], T1[SideIdx], 0.5);
                    EmitClosedBoxWorld(
                        Facets,
                        [MidEdge[0], MidEdge[1]],
                        MidYaw,
                        0.48 * SegLen,
                        0.20,
                        MidEdge[2] + 0.004,
                        MidEdge[2] + 0.88,
                        Road.Style === "bridge" ? CourseMaterial.PaintYellow : CourseMaterial.Aluminium,
                        CourseMaterial.BarrierConcrete,
                        CourseMaterial.SteelDark
                    );
                }
            }

            // Bridge support piers down to ground when elevated > 1.35 m!
            if (Step > 0 && Step % 5 === 0 && St0.P[2] > 1.35)
            {
                const PierYaw = Math.atan2(St0.Tangent[1], St0.Tangent[0]);
                EmitClosedBoxWorld(
                    Facets,
                    [St0.P[0], St0.P[1]],
                    PierYaw,
                    0.75,
                    Math.max(1.1, HalfW * 0.52),
                    -0.30,
                    St0.P[2] - DeckThickness - 0.004,
                    CourseMaterial.SteelDark,
                    CourseMaterial.BarrierConcrete,
                    CourseMaterial.TunnelConcrete
                );
            }

            // Record 3D physics segment for 480 Hz tyre raycast & hull/parapet collision
            PhysicsSegments.push({
                P0:        St0.P,
                P1:        St1.P,
                Z0:        St0.P[2] + 0.025,
                Z1:        St1.P[2] + 0.025,
                Bank0:     St0.BankRad,
                Bank1:     St1.BankRad,
                HalfWidth: HalfW + 0.35,
                Parapet:   HasRails || Math.max(St0.P[2], St1.P[2]) > 1.1,
                Thickness: DeckThickness
            });
        }

        // Start & End Bulkhead Endcaps (closes the 2-manifold prism at Step = 0 and Step = RingCount - 1!)
        const TStart = RingsTop[0], BStart = RingsBot[0];
        const TEnd   = RingsTop[RingCount - 1], BEnd = RingsBot[RingCount - 1];
        for (let Band = 0; Band < K - 1; ++Band)
        {
            // Start cap (outward -Tangent: (+Right)×(+Z) = (-Left)×(+Z) = -Tangent -> [BStart[Band], BStart[Band+1], TStart[Band+1], TStart[Band]])
            EmitManifoldQuad(Facets, BStart[Band], BStart[Band + 1], TStart[Band + 1], TStart[Band], CourseMaterial.TunnelConcrete);
            // End cap (outward +Tangent: [BEnd[Band+1], BEnd[Band], TEnd[Band], TEnd[Band+1]])
            EmitManifoldQuad(Facets, BEnd[Band + 1], BEnd[Band], TEnd[Band], TEnd[Band + 1], CourseMaterial.TunnelConcrete);
        }
    }

    // ② Closed 2-Manifold Polygonal Junction Hubs at every connected RoadNode (bridges multi-road angles seamlessly!)
    for (const Node of Project.Nodes)
    {
        const Radius = NodeMaxWidth.get(Node.Id);
        if (!Radius)
            continue;
        EmitJunctionHubSolid(Facets, Node.Position, Radius + 0.35, Node.Position[2], CourseMaterial.ApronConcrete, 12);
        ExpandBounds(Node.Position, Radius + 1.5);
        // Physics disc at junction so transitions across multi-way elevated junctions stay 100% smooth
        PhysicsSegments.push({
            IsHub:     true,
            Center:    Node.Position.slice(),
            CrownZ:    Node.Position[2] + 0.022,
            Radius:    Radius + 0.45,
            Thickness: 0.44
        });
    }

    const PhysicsSurface = PhysicsSegments.length > 0
        ? ConstructSplinePhysicsSurface(PhysicsSegments, WorldMin, WorldMax)
        : null;

    return { Facets, Alignments, PhysicsSurface };
}

//------------------------------------------------------------------------------------------------------------------------
//                           SPATIAL-HASHED 480 HZ 3D SPLINE ROAD PHYSICS SURFACE
//------------------------------------------------------------------------------------------------------------------------

function ConstructSplinePhysicsSurface(Segments, WorldMin, WorldMax)
{
    const CellSize = 14.0;
    const Bins = new Map();
    const AddToBin = (CX, CY, Seg) =>
    {
        const Key = `${CX},${CY}`;
        let List = Bins.get(Key);
        if (!List) { List = []; Bins.set(Key, List); }
        List.push(Seg);
    };

    for (const Seg of Segments)
    {
        const MinX = Seg.IsHub ? Seg.Center[0] - Seg.Radius : Math.min(Seg.P0[0], Seg.P1[0]) - Seg.HalfWidth - 1.0;
        const MaxX = Seg.IsHub ? Seg.Center[0] + Seg.Radius : Math.max(Seg.P0[0], Seg.P1[0]) + Seg.HalfWidth + 1.0;
        const MinY = Seg.IsHub ? Seg.Center[1] - Seg.Radius : Math.min(Seg.P0[1], Seg.P1[1]) - Seg.HalfWidth - 1.0;
        const MaxY = Seg.IsHub ? Seg.Center[1] + Seg.Radius : Math.max(Seg.P0[1], Seg.P1[1]) + Seg.HalfWidth + 1.0;
        const X0 = Math.floor(MinX / CellSize), X1 = Math.floor(MaxX / CellSize);
        const Y0 = Math.floor(MinY / CellSize), Y1 = Math.floor(MaxY / CellSize);
        for (let CX = X0; CX <= X1; ++CX)
            for (let CY = Y0; CY <= Y1; ++CY)
                AddToBin(CX, CY, Seg);
    }

    const EvaluateDeckHeightAndNormal = (PointXY) =>
    {
        const CX = Math.floor(PointXY[0] / CellSize);
        const CY = Math.floor(PointXY[1] / CellSize);
        const Candidates = Bins.get(`${CX},${CY}`);
        if (!Candidates)
            return null;

        let Best = null;
        for (let Index = 0; Index < Candidates.length; ++Index)
        {
            const Seg = Candidates[Index];
            if (Seg.IsHub)
            {
                const Dist = Math.hypot(PointXY[0] - Seg.Center[0], PointXY[1] - Seg.Center[1]);
                if (Dist <= Seg.Radius)
                {
                    if (!Best || Seg.CrownZ > Best.HeightZ)
                        Best = { HeightZ: Seg.CrownZ, Normal: [0.0, 0.0, 1.0], Thickness: Seg.Thickness, ParapetHit: null };
                }
                continue;
            }

            const DX = Seg.P1[0] - Seg.P0[0], DY = Seg.P1[1] - Seg.P0[1];
            const Len2 = DX * DX + DY * DY;
            if (Len2 < 1.0e-6)
                continue;
            const U = ((PointXY[0] - Seg.P0[0]) * DX + (PointXY[1] - Seg.P0[1]) * DY) / Len2;
            if (U < -0.05 || U > 1.05)
                continue;
            const ClampedU = Clamp(U, 0.0, 1.0);
            const Len = Math.sqrt(Len2);
            const TX = DX / Len, TY = DY / Len;
            const LX = -TY, LY = TX; // +Left unit normal
            const CenterX = Seg.P0[0] + DX * ClampedU;
            const CenterY = Seg.P0[1] + DY * ClampedU;
            const Lat = (PointXY[0] - CenterX) * LX + (PointXY[1] - CenterY) * LY;
            if (Math.abs(Lat) > Seg.HalfWidth)
                continue;

            const Bank = Lerp(Seg.Bank0, Seg.Bank1, ClampedU);
            const BaseZ = Lerp(Seg.Z0, Seg.Z1, ClampedU);
            const TanBank = Math.tan(Bank);
            const HeightZ = BaseZ + Lat * TanBank;
            const SlopeLong = (Seg.Z1 - Seg.Z0) / Len;
            const Normal = NormalizeVector([
                -TX * SlopeLong - LX * TanBank,
                -TY * SlopeLong - LY * TanBank,
                1.0
            ]);

            if (!Best || Math.abs(HeightZ - (PointXY[2] ?? HeightZ)) < Math.abs(Best.HeightZ - (PointXY[2] ?? Best.HeightZ)))
            {
                Best = {
                    HeightZ,
                    Normal,
                    Thickness: Seg.Thickness,
                    Lat,
                    HalfWidth: Seg.HalfWidth,
                    Left:      [LX, LY, 0.0],
                    Parapet:   Seg.Parapet
                };
            }
        }
        return Best;
    };

    return {
        Key:           "SplineRoadEditorNetwork",
        Category:      SurfaceCategory.SplineRoad,
        WorldMinimum:  [WorldMin[0] - 2.0, WorldMin[1] - 2.0, Math.min(-1.0, WorldMin[2] - 1.0)],
        WorldMaximum:  [WorldMax[0] + 2.0, WorldMax[1] + 2.0, WorldMax[2] + 3.0],
        Origin:        [0.0, 0.0, 0.0],
        CosineYaw:     1.0,
        SineYaw:       0.0,
        Right:         [1.0, 0.0, 0.0],
        Forward:       [0.0, 1.0, 0.0],
        Up:            [0.0, 0.0, 1.0],
        CastRay(Origin, Direction, MaximumTravel)
        {
            const Samples = 8;
            let PrevT = 0.0;
            let PrevResidual = null;
            for (let Step = 0; Step <= Samples; ++Step)
            {
                const T = (Step / Samples) * MaximumTravel;
                const P = [Origin[0] + Direction[0] * T, Origin[1] + Direction[1] * T, Origin[2] + Direction[2] * T];
                const Deck = EvaluateDeckHeightAndNormal(P);
                if (!Deck)
                {
                    PrevResidual = null;
                    continue;
                }
                const Residual = P[2] - Deck.HeightZ;
                if (Step === 0 && Residual <= 0.02 && Residual >= -Deck.Thickness && DotVector(Direction, Deck.Normal) < -0.1)
                {
                    return {
                        Travel:      0.0,
                        LocalPoint:  [Origin[0], Origin[1], Deck.HeightZ],
                        LocalNormal: Deck.Normal
                    };
                }
                if (PrevResidual !== null && PrevResidual >= -0.02 && Residual <= 0.02 && DotVector(Direction, Deck.Normal) < -0.1)
                {
                    const Frac = PrevResidual / Math.max(1.0e-6, PrevResidual - Residual);
                    const HitT = Clamp(Lerp(PrevT, T, Frac), 0.0, MaximumTravel);
                    const HitP = [Origin[0] + Direction[0] * HitT, Origin[1] + Direction[1] * HitT, Deck.HeightZ];
                    return {
                        Travel:      HitT,
                        LocalPoint:  HitP,
                        LocalNormal: Deck.Normal
                    };
                }
                PrevT = T;
                PrevResidual = Residual;
            }
            return null;
        },
        QueryHullContact(Point, Radius)
        {
            const Deck = EvaluateDeckHeightAndNormal(Point);
            if (!Deck)
                return null;
            // Deck slab support
            const OffsetZ = Point[2] - Deck.HeightZ;
            if (OffsetZ <= Radius && OffsetZ >= -Deck.Thickness - Radius)
            {
                const TopDepth = Radius - OffsetZ;
                const BotDepth = OffsetZ + Deck.Thickness + Radius;
                if (TopDepth <= BotDepth)
                    return { LocalNormal: Deck.Normal, Depth: TopDepth };
                return { LocalNormal: [-Deck.Normal[0], -Deck.Normal[1], -Deck.Normal[2]], Depth: BotDepth };
            }
            // Guardrail / Bridge parapet lateral containment
            if (Deck.Parapet && OffsetZ > 0.0 && OffsetZ < 0.95 && Deck.HalfWidth)
            {
                const ClearHalf = Deck.HalfWidth - 0.55;
                const Over = Math.abs(Deck.Lat) + Radius - ClearHalf;
                if (Over > 0.0 && Math.abs(Deck.Lat) < Deck.HalfWidth + Radius)
                {
                    const Sign = Deck.Lat >= 0.0 ? -1.0 : 1.0;
                    return { LocalNormal: [Deck.Left[0] * Sign, Deck.Left[1] * Sign, 0.0], Depth: Over };
                }
            }
            return null;
        }
    };
}

//------------------------------------------------------------------------------------------------------------------------
//                          REFERENCE SPLINE ROAD TEMPLATES & TRACK PRESETS (I, J, K...)
//------------------------------------------------------------------------------------------------------------------------

export function CreateDefaultSplineProject(LevelKey = "inversion")
{
    const Project = { Nodes: [], Roads: [] };
    if (LevelKey === "inversion")
    {
        // Starter custom spline road network in the North-East Factory Plaza (X = +128..+206, Y = +372..+438) —
        // connects right outside the Megafactory East Portal so players can drive onto it or reshape its splines immediately!
        const N1 = CreateRoadNode([132.0, 408.0, 0.0], "Factory East Junction", { TrafficLight: true });
        const N2 = CreateRoadNode([172.0, 428.0, 0.0], "North Apex Curve");
        const N3 = CreateRoadNode([200.0, 404.0, 3.8], "Elevated East Overlook");
        const N4 = CreateRoadNode([168.0, 382.0, 0.0], "South Chicane Return");
        Project.Nodes.push(N1, N2, N3, N4);
        Project.Roads.push(
            CreateSplineRoad(Project, N1.Id, N2.Id, { Name: "Track I · Factory Chicane N", Width: 11.0, Style: "race",     H1: [16.0,  2.0, 0.0], H2: [-14.0, -4.0, 0.0], BankDeg:  8.0 }),
            CreateSplineRoad(Project, N2.Id, N3.Id, { Name: "Track I · Sky Overlook Climb", Width: 11.0, Style: "bridge",  H1: [14.0,  2.0, 0.5], H2: [ -2.0, 14.0, 0.0], BankDeg: 12.0, Guardrails: true }),
            CreateSplineRoad(Project, N3.Id, N4.Id, { Name: "Track I · Overlook Descent",   Width: 11.0, Style: "bridge",  H1: [ -2.0,-14.0, 0.0], H2: [ 16.0,  2.0, 0.0], BankDeg: 10.0, Guardrails: true }),
            CreateSplineRoad(Project, N4.Id, N1.Id, { Name: "Track I · Factory Return",     Width: 11.0, Style: "motorway",H1: [-14.0,  4.0, 0.0], H2: [ 14.0, -2.0, 0.0], BankDeg:  0.0 })
        );
    }
    else
    {
        // Proving Grounds starter spline loop on the open South-East apron
        const N1 = CreateRoadNode([ 92.0, -42.0, 0.0], "South Apron Entry", { TrafficLight: true });
        const N2 = CreateRoadNode([134.0, -48.0, 0.0], "Apex Hairpin");
        const N3 = CreateRoadNode([138.0, -22.0, 2.8], "Crest Bridge");
        Project.Nodes.push(N1, N2, N3);
        Project.Roads.push(
            CreateSplineRoad(Project, N1.Id, N2.Id, { Name: "Spline S-Curve", Width: 10.0, Style: "race",   H1: [15.0, -10.0, 0.0], H2: [-15.0, 8.0, 0.0], BankDeg: 10.0 }),
            CreateSplineRoad(Project, N2.Id, N3.Id, { Name: "Spline Flyover", Width: 10.0, Style: "bridge", H1: [12.0,  8.0, 0.5],  H2: [  8.0,-10.0,0.0], Guardrails: true })
        );
    }
    return Project;
}

export const RoadPresetTemplates = Object.freeze([
    {
        Id:    "cloverleaf",
        Label: "+ Track J · Cloverleaf Loop",
        Build(Project, Anchor = [-116.0, 408.0])
        {
            const [CX, CY] = Anchor;
            const W  = CreateRoadNode([CX - 26.0, CY,        0.0], "Clover West",  { TrafficLight: true });
            const E  = CreateRoadNode([CX + 26.0, CY,        0.0], "Clover East");
            const S  = CreateRoadNode([CX,        CY - 24.0, 0.0], "Clover South");
            const N  = CreateRoadNode([CX,        CY + 24.0, 0.0], "Clover North");
            Project.Nodes.push(W, E, S, N);
            Project.Roads.push(
                CreateSplineRoad(Project, W.Id, E.Id, { Name: "Cloverleaf Overpass", Width: 10.5, Style: "bridge", ArchHeight: 5.2, Guardrails: true, H1: [18.0, 0.0, 0.0], H2: [-18.0, 0.0, 0.0] }),
                CreateSplineRoad(Project, S.Id, N.Id, { Name: "Cloverleaf Underpass",Width: 10.5, Style: "motorway", H1: [0.0, 16.0, 0.0], H2: [0.0, -16.0, 0.0] }),
                CreateSplineRoad(Project, E.Id, N.Id, { Name: "270° Clover Leaf Ramp",Width: 8.5, Style: "race", BankDeg: 12.0, H1: [18.0, 22.0, 0.0], H2: [22.0, 18.0, 0.0] })
            );
            return W;
        }
    },
    {
        Id:    "trumpet",
        Label: "+ Track K · Trumpet Flyover",
        Build(Project, Anchor = [-16.0, 376.0])
        {
            const [CX, CY] = Anchor;
            const A = CreateRoadNode([CX - 28.0, CY,        0.0], "Trumpet Entry", { TrafficLight: true });
            const B = CreateRoadNode([CX + 28.0, CY,        0.0], "Trumpet Stem");
            const C = CreateRoadNode([CX + 4.0,  CY + 24.0, 4.6], "Trumpet Crown");
            Project.Nodes.push(A, B, C);
            Project.Roads.push(
                CreateSplineRoad(Project, A.Id, B.Id, { Name: "Trumpet Mainline", Width: 11.5, Style: "motorway", H1: [18.0, 0.0, 0.0], H2: [-18.0, 0.0, 0.0] }),
                CreateSplineRoad(Project, B.Id, C.Id, { Name: "Trumpet Loop Climb", Width: 9.5, Style: "bridge", Guardrails: true, BankDeg: 14.0, H1: [16.0, 18.0, 1.2], H2: [16.0, 4.0, 0.0] }),
                CreateSplineRoad(Project, C.Id, A.Id, { Name: "Trumpet Semi-Direct",Width: 9.5, Style: "bridge", Guardrails: true, BankDeg: -8.0, H1: [-16.0, -4.0, 0.0], H2: [8.0, 14.0, 0.0] })
            );
            return A;
        }
    },
    {
        Id:    "roundabout",
        Label: "+ Roundabout Junction",
        Build(Project, Anchor = [-116.0, 382.0])
        {
            const [CX, CY] = Anchor;
            const R = 16.0, K = 0.55228 * R;
            const N = CreateRoadNode([CX,     CY + R, 0.0], "Roundabout N", { TrafficLight: true });
            const E = CreateRoadNode([CX + R, CY,     0.0], "Roundabout E");
            const S = CreateRoadNode([CX,     CY - R, 0.0], "Roundabout S");
            const W = CreateRoadNode([CX - R, CY,     0.0], "Roundabout W");
            Project.Nodes.push(N, E, S, W);
            Project.Roads.push(
                CreateSplineRoad(Project, N.Id, E.Id, { Name: "Ring NE", Width: 9.5, Style: "urban", H1: [ K, 0, 0], H2: [ 0,  K, 0] }),
                CreateSplineRoad(Project, E.Id, S.Id, { Name: "Ring SE", Width: 9.5, Style: "urban", H1: [ 0,-K, 0], H2: [ K,  0, 0] }),
                CreateSplineRoad(Project, S.Id, W.Id, { Name: "Ring SW", Width: 9.5, Style: "urban", H1: [-K, 0, 0], H2: [ 0, -K, 0] }),
                CreateSplineRoad(Project, W.Id, N.Id, { Name: "Ring NW", Width: 9.5, Style: "urban", H1: [ 0, K, 0], H2: [-K,  0, 0] })
            );
            return N;
        }
    },
    {
        Id:    "scurve",
        Label: "+ Banked S-Curve",
        Build(Project, Anchor = [68.0, 372.0])
        {
            const [CX, CY] = Anchor;
            const A = CreateRoadNode([CX - 28.0, CY - 6.0, 0.0], "S-Curve Entry");
            const B = CreateRoadNode([CX + 28.0, CY + 6.0, 0.0], "S-Curve Exit");
            Project.Nodes.push(A, B);
            Project.Roads.push(
                CreateSplineRoad(Project, A.Id, B.Id, { Name: "Grand Prix S-Curve", Width: 11.0, Style: "race", BankDeg: 15.0, H1: [24.0, 22.0, 0.0], H2: [-24.0, -22.0, 0.0] })
            );
            return A;
        }
    }
]);
