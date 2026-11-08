//============================================================================================================================================
//                                                        ROADSTUDIOADAPTER.JS
//============================================================================================================================================
// Bridges the full Frontier Road Studio engine (Source/RoadStudio/Core/* — cubic Bézier alignments, tangent-fillet junctions,
// connected steel I-girder & concrete girder highway bridges, elastomeric bearings, chamfered piers, 2:1 earth embankments,
// auxiliary speed-change lanes, 7 physical barrier profiles, European bus/cycle lanes, parallel parking, kerbs & utilities)
// directly into Proving Grounds' WebGPU VertexRecords + 480 Hz CastSurfaceRay physics + Hovering Robotic Traffic Lights.

import { CourseMaterial } from "./MaterialSpecification.js";
import { SurfaceCategory } from "./RampSurfaceProjection.js";
import {
    makeDemo,
    makeTemplate,
    parseProject,
    presets,
    patterns,
    patternNames,
    railStyles,
    railNames,
    roadDefaults,
    makeNode,
    makeRoad,
    getNode,
    connected,
    controlPoints
} from "./RoadStudio/Core/model.js";
import { templateCatalog } from "./RoadStudio/Core/templates.js";
import {
    buildNetwork,
    surfaceHeight,
    sideHalfWidth
} from "./RoadStudio/Core/geometry.js";
import {
    insertRoad,
    moveNode,
    translateRoad,
    resolveCrossings,
    deleteSelection
} from "./RoadStudio/Core/editing.js";
import { insertConnectedBridge } from "./RoadStudio/Core/bridge-insertion.js";

export {
    makeDemo,
    makeTemplate,
    parseProject,
    presets,
    patterns,
    patternNames,
    railStyles,
    railNames,
    roadDefaults,
    templateCatalog,
    makeNode,
    makeRoad,
    getNode,
    connected,
    controlPoints,
    buildNetwork,
    insertRoad,
    moveNode,
    translateRoad,
    resolveCrossings,
    deleteSelection,
    insertConnectedBridge
};

// Capacity: 262,144 triangles (786,432 vertices) — comfortably holds full connected highway bridges,
// diamond/trumpet/cloverleaf interchanges, Grand Prix circuits, and urban districts on the GPU.
export const RoadStudioVertexCapacity = 786432;

//------------------------------------------------------------------------------------------------------------------------
//                      COORDINATE MAPPING: ROAD STUDIO Y-UP (x, y, z) <-> PROVING GROUNDS Z-UP (X, Y, Z)
//------------------------------------------------------------------------------------------------------------------------
// Proper right-handed rotation Rx(+90°): (x, y, z) -> (AnchorX + x, AnchorY - z, AnchorZ + y), det = +1.
// Preserves outward CCW triangle winding while mapping +y (Studio elevation) -> +Z (Proving Grounds elevation).

export function StudioPointToWorld(Point, Anchor)
{
    return [
        Anchor[0] + Point[0],
        Anchor[1] - Point[2],
        Anchor[2] + Point[1]
    ];
}

export function WorldPointToStudio(WorldPoint, Anchor)
{
    return [
        WorldPoint[0] - Anchor[0],
        WorldPoint[2] - Anchor[2],
        Anchor[1] - WorldPoint[1]
    ];
}

export function StudioDirectionToWorld(Dir)
{
    return [Dir[0], -Dir[2], Dir[1]];
}

export function ComputeWorldAnchorForBounds(Bounds, LevelKey = "inversion")
{
    const MinStudioX = Bounds && Number.isFinite(Bounds.min?.[0]) ? Bounds.min[0] : -85.0;
    if (LevelKey === "inversion")
    {
        // Keep a clean >= 38 m buffer East of Tracks A–H (MaxX = 222 m), regardless of interchange width.
        const AnchorX = Math.max(360.0, Math.ceil((262.0 - MinStudioX) / 10.0) * 10.0);
        return [AnchorX, 0.0, 0.0];
    }
    const AnchorX = Math.max(220.0, Math.ceil((135.0 - MinStudioX) / 10.0) * 10.0);
    return [AnchorX, 0.0, 0.0];
}

//------------------------------------------------------------------------------------------------------------------------
//                                      MATERIAL & MESH PRIORITY MAPPING FOR WEBGPU GI
//------------------------------------------------------------------------------------------------------------------------

const MeshKindPriority = Object.freeze({
    asphalt:   0,
    structure: 1,
    curb:      2,
    paving:    3,
    cycle:     4,
    bus:       5,
    marking:   6,
    parking:   7,
    rail:      8,
    sign:      9,
    lamp:      10,
    gutter:    11,
    drain:     12,
    planting:  13,
    utility:   14,
    landscape: 15,
    building:  16
});

function ResolveCourseMaterial(MeshKind, MaterialKey, ArcU = 0.0)
{
    if (MaterialKey === "race-curb")
        return (Math.floor(Math.abs(ArcU) / 1.25) & 1) === 0 ? CourseMaterial.KerbRed : CourseMaterial.PaintWhite;
    if (MaterialKey === "asphalt")
        return CourseMaterial.Asphalt;
    if (MaterialKey === "concrete")
        return MeshKind === "structure" ? CourseMaterial.BarrierConcrete : CourseMaterial.ApronConcrete;
    if (MaterialKey === "cobble")
        return CourseMaterial.Stone;
    if (MaterialKey === "pavers" || MaterialKey === "paving-ashlar" || MaterialKey === "paving-linear" ||
        MaterialKey === "paving-slabs" || MaterialKey === "paving-terrazzo")
        return CourseMaterial.Concrete;
    if (MaterialKey === "paving-slate")
        return CourseMaterial.AsphaltPatch;
    if (MaterialKey === "paving-herringbone" || MaterialKey === "paving-running" || MaterialKey === "paving-basket")
        return CourseMaterial.WoodInterior;
    if (MaterialKey === "paving-permeable")
        return CourseMaterial.Gravel;
    if (MaterialKey === "curb" || MaterialKey === "wheel-stop")
        return CourseMaterial.BarrierConcrete;
    if (MaterialKey === "pave-border" || MaterialKey === "gutter")
        return CourseMaterial.AsphaltPatch;
    if (MaterialKey === "paint" || MaterialKey.startsWith("paint-wear-") || MaterialKey.startsWith("marking-"))
        return CourseMaterial.PaintWhite;
    if (MaterialKey === "yellow")
        return CourseMaterial.PaintYellow;
    if (MaterialKey === "accessible-blue" || MaterialKey === "sign-parking")
        return CourseMaterial.PaintBlue;
    if (MaterialKey === "sign-exit" || MaterialKey === "cycle-green")
        return CourseMaterial.PaintGreen;
    if (MaterialKey === "bus-red" || MaterialKey === "cycle-red")
        return CourseMaterial.KerbRed;
    if (MaterialKey === "tactile")
        return CourseMaterial.BannerAmber;
    if (MaterialKey === "steel")
        return CourseMaterial.Aluminium;
    if (MaterialKey === "girder" || MaterialKey === "steel-dark" || MaterialKey === "pole" ||
        MaterialKey.startsWith("utility-") || MaterialKey === "tree-grate" || MaterialKey === "drain-dark")
        return CourseMaterial.SteelDark;
    if (MaterialKey === "road-base" || MaterialKey === "foundation")
        return CourseMaterial.TunnelConcrete;
    if (MaterialKey === "soil")
        return CourseMaterial.Wood;
    if (MaterialKey === "lamp-glow")
        return CourseMaterial.LampWarm;
    if (MaterialKey === "signal-red")
        return CourseMaterial.TrafficRed;
    if (MaterialKey === "signal-green")
        return CourseMaterial.TrafficGreen;
    if (MaterialKey === "rubber")
        return CourseMaterial.Tyre;
    return CourseMaterial.Concrete;
}

function ResolveDecalLift(MeshKind, MaterialKey)
{
    if (MeshKind === "marking" || MaterialKey === "paint" || MaterialKey === "yellow" || MaterialKey.startsWith("marking-"))
        return 0.010;
    if (MaterialKey === "pave-border" || MeshKind === "gutter" || MaterialKey === "tactile")
        return 0.008;
    if (MeshKind === "cycle" || MeshKind === "bus")
        return 0.006;
    return 0.0;
}

//------------------------------------------------------------------------------------------------------------------------
//                                  STARTER PROJECT & PRESET PREPARATION
//------------------------------------------------------------------------------------------------------------------------

export function CreateStarterStudioProject(LevelKey = "inversion")
{
    // Start with the full Northbank district (connected urban streets + highway overpass bridge + signalized boulevard +
    // parallel parking + crosswalks + corner ramps), identical to RoadStudio.html's makeDemo() so both workspaces match!
    const Project = makeDemo();
    if (Project.nodes[0])
        Project.nodes[0].signals = true;
    if (Project.nodes[4])
        Project.nodes[4].signals = true;
    if (LevelKey !== "inversion")
        Project.name = "Proving Grounds · Northbank District";
    return Project;
}

function PrepareProjectForGpuBudget(Project)
{
    const Cloned = JSON.parse(JSON.stringify(Project));
    let ApproxLength = 0.0;
    const NodeMap = new Map(Cloned.nodes.map((N) => [N.id, N]));
    for (const R of Cloned.roads)
    {
        const A = NodeMap.get(R.start);
        const B = NodeMap.get(R.end);
        if (A && B)
            ApproxLength += Math.hypot(B.position[0] - A.position[0], B.position[2] - A.position[2]);
    }
    // On multi-kilometre highway interchanges (cloverleaf, trumpet, diamond, city), widen barrier post intervals
    // on the GPU streaming copy so all decks, girders, piers, bearings, curbs, and rails fit within 262k triangles.
    if (ApproxLength > 1400.0)
    {
        const PostMin = ApproxLength > 4000.0 ? 9.0 : 5.5;
        for (const R of Cloned.roads)
        {
            if (R.guardrails)
                R.postSpacing = Math.max(R.postSpacing ?? 3.4, PostMin);
            if (ApproxLength > 3500.0)
            {
                R.manholes = false;
                R.drainage = false;
            }
        }
    }
    return Cloned;
}

//------------------------------------------------------------------------------------------------------------------------
//                              480 HZ DRIVABLE PHYSICS SURFACES (SPANS + JUNCTIONS)
//------------------------------------------------------------------------------------------------------------------------

function PointInPolygon2D(X, Y, Poly)
{
    let Inside = false;
    for (let I = 0, J = Poly.length - 1; I < Poly.length; J = I++)
    {
        const Xi = Poly[I][0], Yi = Poly[I][1];
        const Xj = Poly[J][0], Yj = Poly[J][1];
        const Intersect = ((Yi > Y) !== (Yj > Y)) &&
                          (X < ((Xj - Xi) * (Y - Yi)) / ((Yj - Yi) || 1.0e-12) + Xi);
        if (Intersect)
            Inside = !Inside;
    }
    return Inside;
}

function BuildSpanPhysicsSurface(Span, Anchor)
{
    const Frames = Span.frames;
    if (!Frames || Frames.length < 2)
        return null;

    const Stations = Frames.map((F) =>
    {
        const Center = StudioPointToWorld(F.p, Anchor);
        const RawTan = StudioDirectionToWorld(F.d);
        const TanLen = Math.hypot(RawTan[0], RawTan[1], RawTan[2]) || 1.0;
        const Tangent = [RawTan[0] / TanLen, RawTan[1] / TanLen, RawTan[2] / TanLen];
        // Studio normal F.n = [-d_z, 0, d_x] maps to World Right = [-F.n[0], F.n[2], 0] or [TangentY, -TangentX, 0]
        const RightXY = StudioDirectionToWorld(F.n);
        const RightLen = Math.hypot(RightXY[0], RightXY[1]) || 1.0;
        const SideAxis = [RightXY[0] / RightLen, RightXY[1] / RightLen];
        const LeftRoad = sideHalfWidth(F, -1);
        const RightRoad = sideHalfWidth(F, 1);
        const Extra = (F.cw ?? 0.16) + (F.sw ?? 0.0);
        return {
            P:         Center,
            Tangent,
            SideAxis,
            CrownRise: surfaceHeight(F),
            Crossfall: (F.crossfall ?? 2.0) * 0.01,
            CurbH:     F.curbHeight ?? 0.14,
            LeftRoad,
            RightRoad,
            LeftFull:  LeftRoad + Extra,
            RightFull: RightRoad + Extra
        };
    });

    let MinX = Infinity, MinY = Infinity, MinZ = Infinity;
    let MaxX = -Infinity, MaxY = -Infinity, MaxZ = -Infinity;
    const SegBounds = [];
    for (let I = 0; I < Stations.length - 1; ++I)
    {
        const A = Stations[I], B = Stations[I + 1];
        const Pad = Math.max(A.LeftFull, A.RightFull, B.LeftFull, B.RightFull) + 1.5;
        const SMinX = Math.min(A.P[0], B.P[0]) - Pad;
        const SMaxX = Math.max(A.P[0], B.P[0]) + Pad;
        const SMinY = Math.min(A.P[1], B.P[1]) - Pad;
        const SMaxY = Math.max(A.P[1], B.P[1]) + Pad;
        const SMinZ = Math.min(A.P[2], B.P[2]) - 1.5;
        const SMaxZ = Math.max(A.P[2], B.P[2]) + A.CrownRise + 2.8;
        SegBounds.push([SMinX, SMinY, SMinZ, SMaxX, SMaxY, SMaxZ]);
        MinX = Math.min(MinX, SMinX); MaxX = Math.max(MaxX, SMaxX);
        MinY = Math.min(MinY, SMinY); MaxY = Math.max(MaxY, SMaxY);
        MinZ = Math.min(MinZ, SMinZ); MaxZ = Math.max(MaxZ, SMaxZ);
    }

    const HasGuardrails = Boolean(Span.road.guardrails);
    const RailHeight = Span.road.railHeight ?? 0.85;

    return {
        Key:          `studio_span_${Span.road.id}`,
        Category:     SurfaceCategory.SplineRoad,
        Origin:       [0.0, 0.0, 0.0],
        CosineYaw:    1.0,
        SineYaw:      0.0,
        Yaw:          0.0,
        Friction:     1.04,
        WorldMinimum: [MinX, MinY, MinZ],
        WorldMaximum: [MaxX, MaxY, MaxZ],
        Bounds:       { Minimum: [MinX, MinY, MinZ], Maximum: [MaxX, MaxY, MaxZ] },
        CastRay(RayOrigin, RayDir, MaxTravel)
        {
            const EndX = RayOrigin[0] + RayDir[0] * MaxTravel;
            const EndY = RayOrigin[1] + RayDir[1] * MaxTravel;
            const EndZ = RayOrigin[2] + RayDir[2] * MaxTravel;
            const RMinX = Math.min(RayOrigin[0], EndX) - 0.35;
            const RMaxX = Math.max(RayOrigin[0], EndX) + 0.35;
            const RMinY = Math.min(RayOrigin[1], EndY) - 0.35;
            const RMaxY = Math.max(RayOrigin[1], EndY) + 0.35;
            const RMinZ = Math.min(RayOrigin[2], EndZ) - 0.35;
            const RMaxZ = Math.max(RayOrigin[2], EndZ) + 0.35;
            if (RMaxX < MinX || RMinX > MaxX || RMaxY < MinY || RMinY > MaxY || RMaxZ < MinZ || RMinZ > MaxZ)
                return null;

            let BestHit = null;
            for (let I = 0; I < Stations.length - 1; ++I)
            {
                const SB = SegBounds[I];
                if (RMaxX < SB[0] || RMinX > SB[3] || RMaxY < SB[1] || RMinY > SB[4] || RMaxZ < SB[2] || RMinZ > SB[5])
                    continue;
                const A = Stations[I], B = Stations[I + 1];
                const SegX = B.P[0] - A.P[0];
                const SegY = B.P[1] - A.P[1];
                const SegLenSq = SegX * SegX + SegY * SegY;
                if (SegLenSq < 1.0e-5)
                    continue;

                // Midpoint plane approximation for ray parameter T, refined once
                const MidZ = 0.5 * (A.P[2] + B.P[2] + A.CrownRise + B.CrownRise);
                let T = Math.abs(RayDir[2]) > 1.0e-5 ? (MidZ - RayOrigin[2]) / RayDir[2] : 0.5 * MaxTravel;
                T = Math.max(0.0, Math.min(MaxTravel, T));
                for (let Pass = 0; Pass < 2; ++Pass)
                {
                    const HX = RayOrigin[0] + RayDir[0] * T;
                    const HY = RayOrigin[1] + RayDir[1] * T;
                    const RawU = ((HX - A.P[0]) * SegX + (HY - A.P[1]) * SegY) / SegLenSq;
                    if (RawU < -0.04 || RawU > 1.04)
                        break;
                    const U = Math.max(0.0, Math.min(1.0, RawU));
                    const CX = A.P[0] + SegX * U;
                    const CY = A.P[1] + SegY * U;
                    const BaseZ = A.P[2] + (B.P[2] - A.P[2]) * U;
                    const Crown = A.CrownRise + (B.CrownRise - A.CrownRise) * U;
                    const CFall = A.Crossfall + (B.Crossfall - A.Crossfall) * U;
                    const SX = A.SideAxis[0] + (B.SideAxis[0] - A.SideAxis[0]) * U;
                    const SY = A.SideAxis[1] + (B.SideAxis[1] - A.SideAxis[1]) * U;
                    const Lat = (HX - CX) * SX + (HY - CY) * SY;
                    const LFull = A.LeftFull + (B.LeftFull - A.LeftFull) * U;
                    const RFull = A.RightFull + (B.RightFull - A.RightFull) * U;
                    if (Lat < -LFull - 0.18 || Lat > RFull + 0.18)
                        break;
                    const LRoad = A.LeftRoad + (B.LeftRoad - A.LeftRoad) * U;
                    const RRoad = A.RightRoad + (B.RightRoad - A.RightRoad) * U;
                    const CurbH = A.CurbH + (B.CurbH - A.CurbH) * U;
                    let SurfZ = BaseZ + Crown - Math.abs(Lat) * CFall;
                    if (Lat < -LRoad)
                    {
                        const EdgeZ = BaseZ + Crown - LRoad * CFall;
                        const Ramp = Math.min(1.0, (-Lat - LRoad) / 0.18);
                        SurfZ = EdgeZ + CurbH * Ramp;
                    }
                    else if (Lat > RRoad)
                    {
                        const EdgeZ = BaseZ + Crown - RRoad * CFall;
                        const Ramp = Math.min(1.0, (Lat - RRoad) / 0.18);
                        SurfZ = EdgeZ + CurbH * Ramp;
                    }
                    if (Pass === 0 && Math.abs(RayDir[2]) > 1.0e-5)
                    {
                        T = (SurfZ - RayOrigin[2]) / RayDir[2];
                        if (T < -0.05 || T > MaxTravel + 0.05)
                            break;
                        T = Math.max(0.0, Math.min(MaxTravel, T));
                    }
                    else
                    {
                        const HZ = RayOrigin[2] + RayDir[2] * T;
                        if (Math.abs(HZ - SurfZ) <= 0.42 && T >= 0.0 && T <= MaxTravel)
                        {
                            const GradeZ = (B.P[2] - A.P[2]) / Math.sqrt(SegLenSq);
                            const Tx = SegX / Math.sqrt(SegLenSq);
                            const Ty = SegY / Math.sqrt(SegLenSq);
                            const LatSlope = Lat >= 0.0 ? -CFall : CFall;
                            let Nx = -Tx * GradeZ - SX * LatSlope;
                            let Ny = -Ty * GradeZ - SY * LatSlope;
                            let Nz = 1.0;
                            const NLen = Math.hypot(Nx, Ny, Nz) || 1.0;
                            Nx /= NLen; Ny /= NLen; Nz /= NLen;
                            if (RayDir[0] * Nx + RayDir[1] * Ny + RayDir[2] * Nz < -1.0e-4 &&
                                (!BestHit || T < BestHit.Travel))
                            {
                                BestHit = {
                                    Travel:      T,
                                    LocalPoint:  [HX, HY, SurfZ],
                                    LocalNormal: [Nx, Ny, Nz]
                                };
                            }
                        }
                    }
                }
            }
            return BestHit;
        },
        QueryHullContact(SphereCenter, SphereRadius)
        {
            if (!HasGuardrails)
                return null;
            if (SphereCenter[0] < MinX - SphereRadius || SphereCenter[0] > MaxX + SphereRadius ||
                SphereCenter[1] < MinY - SphereRadius || SphereCenter[1] > MaxY + SphereRadius)
                return null;
            for (let I = 0; I < Stations.length - 1; ++I)
            {
                const A = Stations[I], B = Stations[I + 1];
                const SegX = B.P[0] - A.P[0], SegY = B.P[1] - A.P[1];
                const SegLenSq = SegX * SegX + SegY * SegY;
                if (SegLenSq < 1.0e-5)
                    continue;
                const RawU = ((SphereCenter[0] - A.P[0]) * SegX + (SphereCenter[1] - A.P[1]) * SegY) / SegLenSq;
                if (RawU < -0.02 || RawU > 1.02)
                    continue;
                const U = Math.max(0.0, Math.min(1.0, RawU));
                const CX = A.P[0] + SegX * U, CY = A.P[1] + SegY * U;
                const BaseZ = A.P[2] + (B.P[2] - A.P[2]) * U + A.CrownRise;
                if (SphereCenter[2] < BaseZ - 0.3 || SphereCenter[2] > BaseZ + RailHeight + SphereRadius)
                    continue;
                const SX = A.SideAxis[0] + (B.SideAxis[0] - A.SideAxis[0]) * U;
                const SY = A.SideAxis[1] + (B.SideAxis[1] - A.SideAxis[1]) * U;
                const Lat = (SphereCenter[0] - CX) * SX + (SphereCenter[1] - CY) * SY;
                const LWall = A.LeftFull + (B.LeftFull - A.LeftFull) * U;
                const RWall = A.RightFull + (B.RightFull - A.RightFull) * U;
                if (Lat < -(LWall - SphereRadius) && Lat > -(LWall + 0.9))
                {
                    return {
                        LocalNormal: [SX, SY, 0.0],
                        Depth:       SphereRadius - (LWall + Lat)
                    };
                }
                if (Lat > (RWall - SphereRadius) && Lat < (RWall + 0.9))
                {
                    return {
                        LocalNormal: [-SX, -SY, 0.0],
                        Depth:       SphereRadius - (RWall - Lat)
                    };
                }
            }
            return null;
        }
    };
}

function BuildJunctionPhysicsSurface(Junction, Anchor)
{
    const Ring = (Junction.outer && Junction.outer.length >= 3) ? Junction.outer : Junction.boundary;
    if (!Ring || Ring.length < 3)
        return null;

    const Poly2D = [];
    let MinX = Infinity, MinY = Infinity, MinZ = Infinity;
    let MaxX = -Infinity, MaxY = -Infinity, MaxZ = -Infinity;
    for (const P of Ring)
    {
        const W = StudioPointToWorld(P, Anchor);
        Poly2D.push([W[0], W[1]]);
        MinX = Math.min(MinX, W[0]); MaxX = Math.max(MaxX, W[0]);
        MinY = Math.min(MinY, W[1]); MaxY = Math.max(MaxY, W[1]);
        MinZ = Math.min(MinZ, W[2]); MaxZ = Math.max(MaxZ, W[2]);
    }
    const NodeW = StudioPointToWorld(Junction.node.position, Anchor);
    const CenterZ = NodeW[2] + 0.12;
    MinZ = Math.min(MinZ, CenterZ) - 1.2;
    MaxZ = Math.max(MaxZ, CenterZ) + 1.8;

    // Fit gentle longitudinal/lateral slope across arm mouths so sloped junctions match arm crowns smoothly
    let SlopeX = 0.0, SlopeY = 0.0;
    if (Junction.arms && Junction.arms.length >= 2)
    {
        let SumXX = 0.0, SumYY = 0.0, SumXZ = 0.0, SumYZ = 0.0;
        for (const Arm of Junction.arms)
        {
            const AW = StudioPointToWorld(Arm.center, Anchor);
            const DX = AW[0] - NodeW[0];
            const DY = AW[1] - NodeW[1];
            const DZ = AW[2] - CenterZ;
            SumXX += DX * DX;
            SumYY += DY * DY;
            SumXZ += DX * DZ;
            SumYZ += DY * DZ;
        }
        if (SumXX > 1.0) SlopeX = Math.max(-0.14, Math.min(0.14, SumXZ / SumXX));
        if (SumYY > 1.0) SlopeY = Math.max(-0.14, Math.min(0.14, SumYZ / SumYY));
    }
    const NLen = Math.hypot(-SlopeX, -SlopeY, 1.0) || 1.0;
    const PlaneNormal = [-SlopeX / NLen, -SlopeY / NLen, 1.0 / NLen];

    return {
        Key:          `studio_junction_${Junction.node.id}`,
        Category:     SurfaceCategory.SplineRoad,
        Origin:       [0.0, 0.0, 0.0],
        CosineYaw:    1.0,
        SineYaw:      0.0,
        Yaw:          0.0,
        Friction:     1.04,
        WorldMinimum: [MinX - 0.5, MinY - 0.5, MinZ],
        WorldMaximum: [MaxX + 0.5, MaxY + 0.5, MaxZ],
        Bounds:       { Minimum: [MinX - 0.5, MinY - 0.5, MinZ], Maximum: [MaxX + 0.5, MaxY + 0.5, MaxZ] },
        CastRay(RayOrigin, RayDir, MaxTravel)
        {
            const Denom = RayDir[0] * PlaneNormal[0] + RayDir[1] * PlaneNormal[1] + RayDir[2] * PlaneNormal[2];
            if (Denom >= -1.0e-5)
                return null;
            const RelX = RayOrigin[0] - NodeW[0];
            const RelY = RayOrigin[1] - NodeW[1];
            const RelZ = RayOrigin[2] - CenterZ;
            const T = -(RelX * PlaneNormal[0] + RelY * PlaneNormal[1] + RelZ * PlaneNormal[2]) / Denom;
            if (T < 0.0 || T > MaxTravel)
                return null;
            const HX = RayOrigin[0] + RayDir[0] * T;
            const HY = RayOrigin[1] + RayDir[1] * T;
            if (HX < MinX - 0.25 || HX > MaxX + 0.25 || HY < MinY - 0.25 || HY > MaxY + 0.25)
                return null;
            if (!PointInPolygon2D(HX, HY, Poly2D))
                return null;
            const HZ = CenterZ + (HX - NodeW[0]) * SlopeX + (HY - NodeW[1]) * SlopeY;
            return {
                Travel:      T,
                LocalPoint:  [HX, HY, HZ],
                LocalNormal: PlaneNormal
            };
        }
    };
}

//------------------------------------------------------------------------------------------------------------------------
//                          MAIN COMPILER: PROJECT -> WEBGPU VERTEXRECORDS + PHYSICS + SIGNALS
//------------------------------------------------------------------------------------------------------------------------

export function CompileStudioProjectForWorld(Project, Options = {})
{
    const LevelKey = Options.LevelKey ?? "inversion";
    const VertexCapacity = Options.VertexCapacity ?? RoadStudioVertexCapacity;
    const Prepared = PrepareProjectForGpuBudget(Project);
    const Network = buildNetwork(Prepared, { detail: "editing" });
    const Anchor = Options.Anchor ?? ComputeWorldAnchorForBounds(Network.bounds, LevelKey);

    // Sort meshes so essential road/bridge/curb/paving/marking/barrier geometry always streams first
    const OrderedMeshes = [...Network.meshes].sort((A, B) =>
    {
        const PA = MeshKindPriority[A.kind] ?? 20;
        const PB = MeshKindPriority[B.kind] ?? 20;
        return PA - PB;
    });

    const RawBytes = new ArrayBuffer(VertexCapacity * 32);
    const VertexScalars = new Float32Array(RawBytes);
    const VertexIntegers = new Uint32Array(RawBytes);
    let VertexCount = 0;

    for (const Mesh of OrderedMeshes)
    {
        const Pos = Mesh.positions;
        const Uvs = Mesh.uvs;
        const Idx = Mesh.indices;
        const Lift = ResolveDecalLift(Mesh.kind, Mesh.material);
        const IsRaceCurb = Mesh.material === "race-curb";
        const FixedMaterial = IsRaceCurb ? 0 : ResolveCourseMaterial(Mesh.kind, Mesh.material, 0.0);

        for (let T = 0; T + 2 < Idx.length; T += 3)
        {
            if (VertexCount + 3 > VertexCapacity)
                break;
            const I0 = Idx[T], I1 = Idx[T + 1], I2 = Idx[T + 2];
            const P0X = Anchor[0] + Pos[I0 * 3],     P0Y = Anchor[1] - Pos[I0 * 3 + 2], P0Z = Anchor[2] + Pos[I0 * 3 + 1];
            const P1X = Anchor[0] + Pos[I1 * 3],     P1Y = Anchor[1] - Pos[I1 * 3 + 2], P1Z = Anchor[2] + Pos[I1 * 3 + 1];
            const P2X = Anchor[0] + Pos[I2 * 3],     P2Y = Anchor[1] - Pos[I2 * 3 + 2], P2Z = Anchor[2] + Pos[I2 * 3 + 1];

            const UX = P1X - P0X, UY = P1Y - P0Y, UZ = P1Z - P0Z;
            const VX = P2X - P0X, VY = P2Y - P0Y, VZ = P2Z - P0Z;
            let NX = UY * VZ - UZ * VY;
            let NY = UZ * VX - UX * VZ;
            let NZ = UX * VY - UY * VX;
            const NLen = Math.hypot(NX, NY, NZ);
            if (NLen < 1.0e-9)
                continue;
            NX /= NLen; NY /= NLen; NZ /= NLen;

            const Mat = (IsRaceCurb
                ? ResolveCourseMaterial(Mesh.kind, Mesh.material, ((Uvs[I0 * 2] ?? 0) + (Uvs[I1 * 2] ?? 0) + (Uvs[I2 * 2] ?? 0)) / 3.0)
                : FixedMaterial) >>> 0;

            const LX = NX * Lift, LY = NY * Lift, LZ = NZ * Lift;
            let Base = VertexCount * 8;
            VertexScalars[Base]      = P0X + LX; VertexScalars[Base + 1]  = P0Y + LY; VertexScalars[Base + 2] = P0Z + LZ; VertexIntegers[Base + 3] = Mat;
            VertexScalars[Base + 4]  = NX;       VertexScalars[Base + 5]  = NY;       VertexScalars[Base + 6] = NZ;       VertexIntegers[Base + 7] = 0;
            Base += 8;
            VertexScalars[Base]      = P1X + LX; VertexScalars[Base + 1]  = P1Y + LY; VertexScalars[Base + 2] = P1Z + LZ; VertexIntegers[Base + 3] = Mat;
            VertexScalars[Base + 4]  = NX;       VertexScalars[Base + 5]  = NY;       VertexScalars[Base + 6] = NZ;       VertexIntegers[Base + 7] = 0;
            Base += 8;
            VertexScalars[Base]      = P2X + LX; VertexScalars[Base + 1]  = P2Y + LY; VertexScalars[Base + 2] = P2Z + LZ; VertexIntegers[Base + 3] = Mat;
            VertexScalars[Base + 4]  = NX;       VertexScalars[Base + 5]  = NY;       VertexScalars[Base + 6] = NZ;       VertexIntegers[Base + 7] = 0;
            VertexCount += 3;
        }
        if (VertexCount + 3 > VertexCapacity)
            break;
    }

    const PhysicsSurfaces = [];
    for (const Span of Network.spans)
    {
        const Surf = BuildSpanPhysicsSurface(Span, Anchor);
        if (Surf)
            PhysicsSurfaces.push(Surf);
    }
    for (const Junc of Network.junctions)
    {
        const Surf = BuildJunctionPhysicsSurface(Junc, Anchor);
        if (Surf)
            PhysicsSurfaces.push(Surf);
    }

    // Spawn Pole-less Hovering Robotic 4-Aspect Traffic Lights above signalized / major 3+ arm urban junctions
    const DynamicSignals = [];
    for (const Junc of Network.junctions)
    {
        if (DynamicSignals.length >= 6)
            break;
        const WantsSignal = Boolean(Junc.node.signals) ||
                            (Junc.arms.length >= 3 && Junc.arms.some((A) => A.road.markingStyle === "urban"));
        if (!WantsSignal)
            continue;
        const W = StudioPointToWorld(Junc.node.position, Anchor);
        const LeadArm = Junc.arms[0];
        const ArmDir = LeadArm ? StudioDirectionToWorld(LeadArm.d) : [1.0, 0.0, 0.0];
        DynamicSignals.push({
            Id:          `tl_studio_${Junc.node.id}`,
            Name:        `${Junc.node.name} Hover Signal`,
            Position:    [W[0], W[1], W[2]],
            Yaw:         Math.atan2(ArmDir[1], ArmDir[0]),
            PhaseOffset: DynamicSignals.length * 3.8
        });
    }

    return {
        Network,
        Anchor,
        Vertices: VertexScalars.subarray(0, VertexCount * 8),
        VertexCount,
        TriangleCount: Math.floor(VertexCount / 3),
        PhysicsSurfaces,
        DynamicSignals
    };
}

export function ResolveSpawnPoseForSelection(Compiled, Project, Selection = null)
{
    const { Network, Anchor } = Compiled;
    if (Selection && Selection.kind === "road")
    {
        const Span = Network.spans.find((S) => S.road.id === Selection.id);
        if (Span && Span.frames.length >= 2)
        {
            const Idx = Math.min(Math.floor(Span.frames.length * 0.25), Span.frames.length - 1);
            const F = Span.frames[Idx];
            const W = StudioPointToWorld(F.p, Anchor);
            const D = StudioDirectionToWorld(F.d);
            return {
                Name:     Span.road.name,
                Position: [W[0], W[1], W[2] + surfaceHeight(F) + 0.68],
                YawRad:   Math.atan2(D[1], D[0])
            };
        }
    }
    if (Selection && Selection.kind === "node")
    {
        const Node = Project.nodes.find((N) => N.id === Selection.id);
        if (Node)
        {
            const W = StudioPointToWorld(Node.position, Anchor);
            const Junc = Network.junctions.find((J) => J.node.id === Node.id);
            const Dir = Junc?.arms[0] ? StudioDirectionToWorld(Junc.arms[0].d) : [1.0, 0.0, 0.0];
            return {
                Name:     Node.name,
                Position: [W[0], W[1], W[2] + 0.80],
                YawRad:   Math.atan2(Dir[1], Dir[0])
            };
        }
    }
    // Prefer an elevated bridge span if present so "Drive on Network" showcases bridges immediately!
    const BridgeSpan = Network.spans.find((S) => S.road.bridge && S.frames.length >= 3) || Network.spans[0];
    if (BridgeSpan && BridgeSpan.frames.length >= 2)
    {
        const Idx = Math.floor(BridgeSpan.frames.length * 0.5);
        const F = BridgeSpan.frames[Idx];
        const W = StudioPointToWorld(F.p, Anchor);
        const D = StudioDirectionToWorld(F.d);
        return {
            Name:     BridgeSpan.road.name,
            Position: [W[0], W[1], W[2] + surfaceHeight(F) + 0.68],
            YawRad:   Math.atan2(D[1], D[0])
        };
    }
    return {
        Name:     Project.name || "Road Studio Network",
        Position: [Anchor[0], Anchor[1], Anchor[2] + 0.80],
        YawRad:   0.0
    };
}
