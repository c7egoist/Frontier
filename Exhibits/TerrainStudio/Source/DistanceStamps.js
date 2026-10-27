//============================================================================================================================================
//                                                              DISTANCESTAMPS.JS
//============================================================================================================================================
// 🧩 The 3D SDF / voxel engine: signed-distance caves, through-tunnels, cliff overhangs and arches
//    evaluated in 3D space (x, y, z), combined against the gradient-corrected terrain SDF with
//    SmoothMax (subtractive cave carving) and SmoothMin (arches/overhangs), then polygonised with
//    3D Surface Nets.
//
// 📝 Why caves and steep/\/ walls need true 3D SDF + voxel surface nets:
//    1. A 2D heightfield is single-valued per (x, z) — it can never represent a cave roof, tunnel,
//       hole, or overhanging cliff ledge, and on nearly-vertical walls or sharp \/ valleys its 2D
//       grid triangles stretch vertically.
//    2. Wherever a cave mouth breaches the terrain surface, PolygoniseStamps writes the CaveCutout
//       channel (uploaded in FieldTexC.b). The heightmap fragment shader discards inside that cutout
//       while the 3D Surface-Nets voxel mesh wraps seamlessly from the rounded exterior lip through
//       the vaulted cave ceiling, walls and floor.

import { LatticeNoise, ConstructRandomStream, Resolution, TexelSize, WorldExtent, SlopeAt } from "./ReliefField.js?v=13";

const Shrink = 0.4;   // [m] how far additive stamp skins tuck beneath the heightfield far from their rim

export const StampShapes =
[
    { Id: "Cave",  Label: "Cave tunnel",  Blurb: "Subtractive 3D vaulted cavern bored into rock" },
    { Id: "Arch",  Label: "Natural arch", Blurb: "Half-torus span on two legs" },
    { Id: "Spire", Label: "Rock spire",   Blurb: "Bent, tapered pinnacle" },
    { Id: "Crag",  Label: "Crag cluster", Blurb: "Fused boulders, frost-riven" },
    { Id: "Fin",   Label: "Sandstone fin", Blurb: "Thin upstanding wall" },
];

let NextStampSerial = 1;

export function ConstructStamp(Shape, X, Z, Scale, Rotation)
{
    return {
        Serial   : NextStampSerial++,
        Shape    : Shape,
        X        : X,
        Z        : Z,
        Scale    : Scale,
        Rotation : Rotation || 0,
        Blend    : Math.max(Scale * 0.12, 4.0),
        Sink     : Math.max(Scale * 0.06, 3.0),
    };
}

export function ConstructCave(X, Y, Z, EndX, EndY, EndZ, Radius, Blend)
{
    const R = Math.max(Radius || 24.0, 6.0);
    return {
        Serial : NextStampSerial++,
        Shape  : "Cave",
        X      : X,
        Y      : Y,
        Z      : Z,
        EndX   : EndX !== undefined ? EndX : X,
        EndY   : EndY !== undefined ? EndY : Y - 4.0,
        EndZ   : EndZ !== undefined ? EndZ : Z + R * 2.2,
        Scale  : R,
        Blend  : Blend !== undefined ? Blend : Math.max(R * 0.36, 5.0),
    };
}

function SmoothMin(A, B, K)
{
    const H = Math.min(Math.max(0.5 + 0.5 * (B - A) / Math.max(K, 0.001), 0.0), 1.0);
    return B + (A - B) * H - K * H * (1.0 - H);
}

function SmoothMax(A, B, K)
{
    return -SmoothMin(-A, -B, K);
}

//--------------------------------------------------------------------------------------------------------------------------------------------
//                                                                  PRIMITIVE DISTANCES
//--------------------------------------------------------------------------------------------------------------------------------------------

const RuggedNoise = new LatticeNoise(4242);

// 📝 3D vaulted cave capsule from (X, Y, Z) at the cliff mouth to (EndX, EndY, EndZ) deep inside the
//    mountain. The lower half is squashed vertically so the cave has a wide walkable floor (\___/)
//    and an arched rock vault above, flaring slightly at the entrance (t -> 0).
export function CaveDistance(Cave, Px, Py, Pz)
{
    const Ax = Cave.X, Ay = Cave.Y, Az = Cave.Z;
    const Bx = Cave.EndX, By = Cave.EndY, Bz = Cave.EndZ;
    const Dx = Bx - Ax, Dy = By - Ay, Dz = Bz - Az;
    const LenSq = Dx * Dx + Dy * Dy + Dz * Dz;
    let T = 0.0;
    if (LenSq > 0.0001)
    {
        T = ((Px - Ax) * Dx + (Py - Ay) * Dy + (Pz - Az) * Dz) / LenSq;
        T = T < 0.0 ? 0.0 : T > 1.0 ? 1.0 : T;
    }
    const Cx = Ax + Dx * T;
    const Cy = Ay + Dy * T;
    const Cz = Az + Dz * T;
    const Qx = Px - Cx;
    const Qy = Py - Cy;
    const Qz = Pz - Cz;

    // Flatten the floor (Qy < 0) and arch the ceiling (Qy > 0).
    const ScaledY = Qy < 0.0 ? Qy * 1.68 : Qy * 0.90;
    // Flare the cave mouth near t = 0 so the entrance arch opens generously into the cliff wall.
    const MouthFlare = 1.18 - 0.24 * T;
    const RadiusHere = Cave.Scale * MouthFlare;

    const RawDist = Math.sqrt(Qx * Qx + ScaledY * ScaledY + Qz * Qz) - RadiusHere;
    // Stratified 3D karst wall roughness so cave interiors read as bedded rock, not smooth plastic tubes.
    const Freq = 2.2 / Math.max(Cave.Scale, 10.0);
    const Karst = (RuggedNoise.Sample(Px * Freq + Cave.Serial * 1.7, Py * Freq * 1.6) * 0.65
                 + RuggedNoise.Sample(Pz * Freq - Cave.Serial * 1.3, Py * Freq * 1.4) * 0.35);
    return RawDist + Karst * Cave.Scale * 0.085;
}

function ArchDistance(Px, Py, Pz, Scale)
{
    const RingRadius = Scale * 0.32;
    const TubeRadius = Scale * 0.085;
    const LegY = Math.max(Py, 0.0);
    const RingQ = Math.sqrt(Px * Px + LegY * LegY) - RingRadius;
    return Math.sqrt(RingQ * RingQ + Pz * Pz) - TubeRadius;
}

function SpireDistance(Px, Py, Pz, Scale)
{
    const Height     = Scale * 1.05;
    const RadiusBase = Scale * 0.17;
    const RadiusTop  = Scale * 0.035;
    const BendT = Math.min(Math.max(Py / Height, 0.0), 1.0);
    const BentX = Px - BendT * BendT * Scale * 0.13;
    const Qx = Math.sqrt(BentX * BentX + Pz * Pz);
    const Qy = Py;
    const B = (RadiusBase - RadiusTop) / Height;
    const A = Math.sqrt(1.0 - B * B);
    const K = Qx * -B + Qy * A;
    if (K < 0.0)
        return Math.sqrt(Qx * Qx + Qy * Qy) - RadiusBase;
    if (K > A * Height)
        return Math.sqrt(Qx * Qx + (Qy - Height) * (Qy - Height)) - RadiusTop;
    return Qx * A + Qy * B - RadiusBase;
}

function CragDistance(Px, Py, Pz, Scale, Serial)
{
    const NextRandom = ConstructRandomStream(Serial * 131 + 7);
    let Distance = 1e9;
    const SquashedY = Py / 0.78;
    for (let Boulder = 0; Boulder < 5; Boulder++)
    {
        const CentreX = (NextRandom() - 0.5) * Scale * 0.62;
        const CentreY = NextRandom() * Scale * 0.30;
        const CentreZ = (NextRandom() - 0.5) * Scale * 0.62;
        const Radius  = Scale * (0.20 + NextRandom() * 0.15);
        const Dx = Px - CentreX;
        const Dy = SquashedY - CentreY;
        const Dz = Pz - CentreZ;
        const Sphere = Math.sqrt(Dx * Dx + Dy * Dy + Dz * Dz) - Radius;
        Distance = SmoothMin(Distance, Sphere, Scale * 0.10);
    }
    return Distance;
}

function FinDistance(Px, Py, Pz, Scale)
{
    const HalfX = Scale * 0.46;
    const HalfY = Scale * 0.20;
    const HalfZ = Scale * 0.065;
    const Rounding = Scale * 0.055;
    const CentreY = Py - HalfY;
    const Qx = Math.abs(Px) - (HalfX - Rounding);
    const Qy = Math.abs(CentreY) - (HalfY - Rounding);
    const Qz = Math.abs(Pz) - (HalfZ - Rounding);
    const Ox = Math.max(Qx, 0.0);
    const Oy = Math.max(Qy, 0.0);
    const Oz = Math.max(Qz, 0.0);
    const Outside = Math.sqrt(Ox * Ox + Oy * Oy + Oz * Oz);
    const Inside = Math.min(Math.max(Qx, Math.max(Qy, Qz)), 0.0);
    return Outside + Inside - Rounding;
}

export function StampDistance(Stamp, WorldX, WorldY, WorldZ, BaseY)
{
    if (Stamp.Shape === "Cave")
        return CaveDistance(Stamp, WorldX, WorldY, WorldZ);

    const Radians = Stamp.Rotation * Math.PI / 180.0;
    const CosR = Math.cos(Radians);
    const SinR = Math.sin(Radians);
    const RelX = WorldX - Stamp.X;
    const RelZ = WorldZ - Stamp.Z;
    const LocalX = RelX * CosR - RelZ * SinR;
    const LocalZ = RelX * SinR + RelZ * CosR;
    const LocalY = WorldY - BaseY + Stamp.Sink;

    let Distance;
    let Ruggedness = 1.0;
    switch (Stamp.Shape)
    {
        case "Spire": Distance = SpireDistance(LocalX, LocalY, LocalZ, Stamp.Scale); Ruggedness = 0.8; break;
        case "Crag":  Distance = CragDistance(LocalX, LocalY, LocalZ, Stamp.Scale, Stamp.Serial); Ruggedness = 1.5; break;
        case "Fin":   Distance = FinDistance(LocalX, LocalY, LocalZ, Stamp.Scale); Ruggedness = 0.55; break;
        default:      Distance = ArchDistance(LocalX, LocalY, LocalZ, Stamp.Scale); Ruggedness = 1.0; break;
    }

    const Freq = 2.6 / Stamp.Scale;
    const Displace = (RuggedNoise.Sample(LocalX * Freq + Stamp.Serial, LocalY * Freq) * 0.62
                    + RuggedNoise.Sample(LocalZ * Freq, LocalX * Freq - Stamp.Serial) * 0.38);
    return Distance + Displace * Stamp.Scale * 0.020 * Ruggedness;
}

export function StampHeightReach(Stamp)
{
    switch (Stamp.Shape)
    {
        case "Spire": return Stamp.Scale * 1.10;
        case "Crag":  return Stamp.Scale * 0.52;
        case "Fin":   return Stamp.Scale * 0.44;
        default:      return Stamp.Scale * 0.44;
    }
}

//--------------------------------------------------------------------------------------------------------------------------------------------
//                                                              PROCEDURAL CAVE SYSTEM
//--------------------------------------------------------------------------------------------------------------------------------------------

// 📝 Scans the current relief for steep cliff walls, gorge faces and narrow spurs, then bores seeded
//    3D SDF cave tunnels horizontally into the rock. Called by the CaveNetwork layer in the stack.
export function BuildProceduralCaves(Field, Layer)
{
    const P          = Layer.Params;
    const Count      = Math.max(1, Math.min(Math.round(P.CaveCount || 4), 12));
    const Aperture   = Math.max(12.0, P.Aperture || 26.0);
    const Depth      = Math.max(30.0, P.TunnelDepth || 95.0);
    const Blend      = Math.max(4.0, P.Blend || Math.round(Aperture * 0.36));
    const NextRandom = ConstructRandomStream((Layer.Seed || 5151) ^ 0x6C4F);
    const N          = Resolution;
    const Heights    = Field.Heights;
    Field.MeasureRange();

    const Candidates = [];
    const Margin = Math.floor(N * 0.16);
    const Step = 14;
    for (let Z = Margin; Z < N - Margin; Z += Step)
    {
        for (let X = Margin; X < N - Margin; X += Step)
        {
            const Slope = SlopeAt(Heights, X, Z);
            if (Slope < 0.52 || Slope > 3.2)
                continue;
            const H0 = Heights[Z * N + X];
            const ElevNorm = (H0 - Field.Minimum) / Math.max(Field.Maximum - Field.Minimum, 1.0);
            if (ElevNorm < 0.10 || ElevNorm > 0.72)
                continue;

            // Upslope horizontal direction (pointing straight into the cliff wall).
            const GradX = (Heights[Z * N + Math.min(X + 2, N - 1)] - Heights[Z * N + Math.max(X - 2, 0)]) / (4.0 * TexelSize);
            const GradZ = (Heights[Math.min(Z + 2, N - 1) * N + X] - Heights[Math.max(Z - 2, 0) * N + X]) / (4.0 * TexelSize);
            const GradLen = Math.sqrt(GradX * GradX + GradZ * GradZ);
            if (GradLen < 0.45)
                continue;
            const InX = GradX / GradLen;
            const InZ = GradZ / GradLen;

            const WorldX = (X + 0.5) * TexelSize - WorldExtent * 0.5;
            const WorldZ = (Z + 0.5) * TexelSize - WorldExtent * 0.5;
            const MidH = Field.HeightAt(WorldX + InX * Depth * 0.55, WorldZ + InZ * Depth * 0.55);
            const RoofThickness = MidH - H0;
            if (RoofThickness < Aperture * 0.85)
                continue;

            // Favour cliffs with a strong rock roof and camera-visible orientation.
            const FacingBonus = (InZ < 0.25 ? 1.25 : 0.85) * (1.0 + NextRandom() * 0.35);
            const Score = Math.min(Slope, 1.8) * Math.min(RoofThickness / Aperture, 3.0) * FacingBonus;
            Candidates.push({ WorldX, WorldY: H0, WorldZ, InX, InZ, Score });
        }
    }

    Candidates.sort((A, B) => B.Score - A.Score);
    const Chosen = [];
    const MinSeparation = Math.max(Aperture * 6.5, 210.0);
    for (const Cand of Candidates)
    {
        if (Chosen.length >= Count)
            break;
        let TooClose = false;
        for (const Existing of Chosen)
        {
            if (Math.hypot(Cand.WorldX - Existing.WorldX, Cand.WorldZ - Existing.WorldZ) < MinSeparation)
            {
                TooClose = true;
                break;
            }
        }
        if (TooClose)
            continue;
        Chosen.push(Cand);

        const RadiusHere = Aperture * (0.88 + NextRandom() * 0.24);
        const StartX = Cand.WorldX - Cand.InX * RadiusHere * 0.30;
        const StartY = Cand.WorldY + RadiusHere * 0.08;
        const StartZ = Cand.WorldZ - Cand.InZ * RadiusHere * 0.30;
        const YawJitter = (NextRandom() - 0.5) * 0.32;
        const CosJ = Math.cos(YawJitter), SinJ = Math.sin(YawJitter);
        const DirX = Cand.InX * CosJ - Cand.InZ * SinJ;
        const DirZ = Cand.InX * SinJ + Cand.InZ * CosJ;
        const EndX = Cand.WorldX + DirX * Depth;
        const EndY = Cand.WorldY - RadiusHere * 0.06;
        const EndZ = Cand.WorldZ + DirZ * Depth;

        Field.LayerCaves.push(ConstructCave(StartX, StartY, StartZ, EndX, EndY, EndZ, RadiusHere, Blend));
    }
}

// 📝 Packs up to MaxCount active caves into vec4 uniform arrays so the shader raymarcher can trace
//    the exact same 3D cave capsules analytically.
export function PackCaveUniforms(Field, MaxCount = 24)
{
    const AllCaves = [...(Field.LayerCaves || []), ...(Field.UserCaves || [])];
    const Count = Math.min(AllCaves.length, MaxCount);
    const Starts = new Float32Array(MaxCount * 4);
    const Ends   = new Float32Array(MaxCount * 4);
    for (let Index = 0; Index < Count; Index++)
    {
        const Cave = AllCaves[Index];
        Starts[Index * 4]     = Cave.X;
        Starts[Index * 4 + 1] = Cave.Y;
        Starts[Index * 4 + 2] = Cave.Z;
        Starts[Index * 4 + 3] = Cave.Scale;
        Ends[Index * 4]       = Cave.EndX;
        Ends[Index * 4 + 1]   = Cave.EndY;
        Ends[Index * 4 + 2]   = Cave.EndZ;
        Ends[Index * 4 + 3]   = Cave.Blend || Math.max(Cave.Scale * 0.35, 5.0);
    }
    return { Count, Starts, Ends };
}

//--------------------------------------------------------------------------------------------------------------------------------------------
//                                                                  SURFACE NETS
//--------------------------------------------------------------------------------------------------------------------------------------------

function CaveBounds(Cave)
{
    const Margin = Cave.Scale * 1.35 + (Cave.Blend || 8.0) + 6.0;
    return {
        MinX: Math.min(Cave.X, Cave.EndX) - Margin,
        MaxX: Math.max(Cave.X, Cave.EndX) + Margin,
        MinY: Math.min(Cave.Y, Cave.EndY) - Cave.Scale * 1.15 - (Cave.Blend || 8.0) - 4.0,
        MaxY: Math.max(Cave.Y, Cave.EndY) + Cave.Scale * 1.45 + (Cave.Blend || 8.0) + 6.0,
        MinZ: Math.min(Cave.Z, Cave.EndZ) - Margin,
        MaxZ: Math.max(Cave.Z, Cave.EndZ) + Margin,
    };
}

function ClusterCaves(Caves)
{
    const Clusters = [];
    for (const Cave of Caves)
    {
        const Bounds = CaveBounds(Cave);
        let Merged = null;
        for (const Cluster of Clusters)
        {
            const OverlapX = Bounds.MinX <= Cluster.MaxX && Bounds.MaxX >= Cluster.MinX;
            const OverlapZ = Bounds.MinZ <= Cluster.MaxZ && Bounds.MaxZ >= Cluster.MinZ;
            const SpanX = Math.max(Bounds.MaxX, Cluster.MaxX) - Math.min(Bounds.MinX, Cluster.MinX);
            const SpanZ = Math.max(Bounds.MaxZ, Cluster.MaxZ) - Math.min(Bounds.MinZ, Cluster.MinZ);
            if (OverlapX && OverlapZ && SpanX < 260.0 && SpanZ < 260.0)
            {
                Merged = Cluster;
                break;
            }
        }
        if (Merged)
        {
            Merged.Items.push(Cave);
            Merged.MinX = Math.min(Merged.MinX, Bounds.MinX);
            Merged.MaxX = Math.max(Merged.MaxX, Bounds.MaxX);
            Merged.MinY = Math.min(Merged.MinY, Bounds.MinY);
            Merged.MaxY = Math.max(Merged.MaxY, Bounds.MaxY);
            Merged.MinZ = Math.min(Merged.MinZ, Bounds.MinZ);
            Merged.MaxZ = Math.max(Merged.MaxZ, Bounds.MaxZ);
            Merged.Blend = Math.max(Merged.Blend, Cave.Blend || 8.0);
        }
        else
        {
            Clusters.push({
                Items: [Cave],
                MinX: Bounds.MinX, MaxX: Bounds.MaxX,
                MinY: Bounds.MinY, MaxY: Bounds.MaxY,
                MinZ: Bounds.MinZ, MaxZ: Bounds.MaxZ,
                Blend: Cave.Blend || 8.0,
            });
        }
    }
    return Clusters;
}

function PolygoniseVolume(MinX, MaxX, MinY, MaxY, MinZ, MaxZ, VoxelTarget, FieldAt, Positions, Normals, Indices, IncludeVertex = null)
{
    const DimX = Math.max(4, Math.min(Math.ceil((MaxX - MinX) / VoxelTarget), 92));
    const DimY = Math.max(4, Math.min(Math.ceil((MaxY - MinY) / VoxelTarget), 84));
    const DimZ = Math.max(4, Math.min(Math.ceil((MaxZ - MinZ) / VoxelTarget), 92));
    const StepX = (MaxX - MinX) / DimX;
    const StepY = (MaxY - MinY) / DimY;
    const StepZ = (MaxZ - MinZ) / DimZ;
    const Voxel = Math.max(StepX, StepY, StepZ);

    const NodeCountX = DimX + 1;
    const NodeCountY = DimY + 1;
    const NodeStride = NodeCountX * NodeCountY;
    const Lattice = new Float32Array(NodeCountX * NodeCountY * (DimZ + 1));
    for (let Kz = 0; Kz <= DimZ; Kz++)
    {
        const Pz = MinZ + Kz * StepZ;
        for (let Ky = 0; Ky <= DimY; Ky++)
        {
            const Py = MinY + Ky * StepY;
            for (let Kx = 0; Kx <= DimX; Kx++)
            {
                Lattice[Kz * NodeStride + Ky * NodeCountX + Kx] =
                    FieldAt(MinX + Kx * StepX, Py, Pz);
            }
        }
    }
    const NodeAt = (Kx, Ky, Kz) => Lattice[Kz * NodeStride + Ky * NodeCountX + Kx];

    const CellVertex = new Int32Array(DimX * DimY * DimZ).fill(-1);
    const CornerOffsets =
    [
        [0,0,0],[1,0,0],[0,1,0],[1,1,0],
        [0,0,1],[1,0,1],[0,1,1],[1,1,1],
    ];
    const EdgePairs =
    [
        [0,1],[2,3],[4,5],[6,7],
        [0,2],[1,3],[4,6],[5,7],
        [0,4],[1,5],[2,6],[3,7],
    ];

    for (let Kz = 0; Kz < DimZ; Kz++)
    {
        for (let Ky = 0; Ky < DimY; Ky++)
        {
            for (let Kx = 0; Kx < DimX; Kx++)
            {
                const CornerDistances = new Array(8);
                let Mask = 0;
                for (let Corner = 0; Corner < 8; Corner++)
                {
                    const Off = CornerOffsets[Corner];
                    const Dist = NodeAt(Kx + Off[0], Ky + Off[1], Kz + Off[2]);
                    CornerDistances[Corner] = Dist;
                    if (Dist < 0.0)
                        Mask |= (1 << Corner);
                }
                if (Mask === 0 || Mask === 255)
                    continue;

                let SumX = 0.0, SumY = 0.0, SumZ = 0.0, Crossings = 0;
                for (const Pair of EdgePairs)
                {
                    const A = Pair[0], B = Pair[1];
                    const Da = CornerDistances[A], Db = CornerDistances[B];
                    if ((Da < 0.0) === (Db < 0.0))
                        continue;
                    const T = Da / (Da - Db);
                    const OffA = CornerOffsets[A], OffB = CornerOffsets[B];
                    SumX += (Kx + OffA[0] + (OffB[0] - OffA[0]) * T) * StepX + MinX;
                    SumY += (Ky + OffA[1] + (OffB[1] - OffA[1]) * T) * StepY + MinY;
                    SumZ += (Kz + OffA[2] + (OffB[2] - OffA[2]) * T) * StepZ + MinZ;
                    Crossings++;
                }
                if (Crossings === 0)
                    continue;
                const Vx = SumX / Crossings;
                const Vy = SumY / Crossings;
                const Vz = SumZ / Crossings;
                if (IncludeVertex && !IncludeVertex(Vx, Vy, Vz))
                    continue;

                const Eps = Voxel * 0.55;
                const Gx = FieldAt(Vx + Eps, Vy, Vz) - FieldAt(Vx - Eps, Vy, Vz);
                const Gy = FieldAt(Vx, Vy + Eps, Vz) - FieldAt(Vx, Vy - Eps, Vz);
                const Gz = FieldAt(Vx, Vy, Vz + Eps) - FieldAt(Vx, Vy, Vz - Eps);
                const GLen = Math.sqrt(Gx * Gx + Gy * Gy + Gz * Gz) || 1.0;

                CellVertex[Kz * DimX * DimY + Ky * DimX + Kx] = Positions.length / 3;
                Positions.push(Vx, Vy, Vz);
                Normals.push(Gx / GLen, Gy / GLen, Gz / GLen);
            }
        }
    }

    const CellIndex = (Kx, Ky, Kz) =>
    {
        if (Kx < 0 || Ky < 0 || Kz < 0 || Kx >= DimX || Ky >= DimY || Kz >= DimZ)
            return -1;
        return CellVertex[Kz * DimX * DimY + Ky * DimX + Kx];
    };

    const EmitQuad = (A, B, C, D) =>
    {
        if (A < 0 || B < 0 || C < 0 || D < 0)
            return;
        const Ax = Positions[A * 3], Ay = Positions[A * 3 + 1], Az = Positions[A * 3 + 2];
        const Bx = Positions[B * 3], By = Positions[B * 3 + 1], Bz = Positions[B * 3 + 2];
        const Cx = Positions[C * 3], Cy = Positions[C * 3 + 1], Cz = Positions[C * 3 + 2];
        const E1x = Bx - Ax, E1y = By - Ay, E1z = Bz - Az;
        const E2x = Cx - Ax, E2y = Cy - Ay, E2z = Cz - Az;
        const Fx = E1y * E2z - E1z * E2y;
        const Fy = E1z * E2x - E1x * E2z;
        const Fz = E1x * E2y - E1y * E2x;
        const Nx = Normals[A * 3] + Normals[B * 3] + Normals[C * 3] + Normals[D * 3];
        const Ny = Normals[A * 3 + 1] + Normals[B * 3 + 1] + Normals[C * 3 + 1] + Normals[D * 3 + 1];
        const Nz = Normals[A * 3 + 2] + Normals[B * 3 + 2] + Normals[C * 3 + 2] + Normals[D * 3 + 2];
        if (Fx * Nx + Fy * Ny + Fz * Nz >= 0.0)
            Indices.push(A, B, C, A, C, D);
        else
            Indices.push(A, C, B, A, D, C);
    };

    for (let Kz = 0; Kz <= DimZ; Kz++)
    {
        for (let Ky = 0; Ky <= DimY; Ky++)
        {
            for (let Kx = 0; Kx <= DimX; Kx++)
            {
                if (Kx < DimX && ((NodeAt(Kx, Ky, Kz) < 0.0) !== (NodeAt(Kx + 1, Ky, Kz) < 0.0)))
                {
                    EmitQuad(CellIndex(Kx, Ky - 1, Kz - 1), CellIndex(Kx, Ky, Kz - 1),
                             CellIndex(Kx, Ky, Kz),         CellIndex(Kx, Ky - 1, Kz));
                }
                if (Ky < DimY && ((NodeAt(Kx, Ky, Kz) < 0.0) !== (NodeAt(Kx, Ky + 1, Kz) < 0.0)))
                {
                    EmitQuad(CellIndex(Kx - 1, Ky, Kz - 1), CellIndex(Kx - 1, Ky, Kz),
                             CellIndex(Kx, Ky, Kz),         CellIndex(Kx, Ky, Kz - 1));
                }
                if (Kz < DimZ && ((NodeAt(Kx, Ky, Kz) < 0.0) !== (NodeAt(Kx, Ky, Kz + 1) < 0.0)))
                {
                    EmitQuad(CellIndex(Kx - 1, Ky - 1, Kz), CellIndex(Kx, Ky - 1, Kz),
                             CellIndex(Kx, Ky, Kz),         CellIndex(Kx - 1, Ky, Kz));
                }
            }
        }
    }
}

export function PolygoniseStamps(Field, Stamps)
{
    const Positions = [];
    const Normals   = [];
    const Indices   = [];

    const Cutout = Field.ChannelSamples("CaveCutout");
    if (Cutout)
        Cutout.fill(0.0);

    const AllCaves = [...(Field.LayerCaves || []), ...(Field.UserCaves || [])];
    const AdditiveStamps = (Stamps || []).filter((S) => S.Shape !== "Cave");
    const ExtraCaves     = (Stamps || []).filter((S) => S.Shape === "Cave");
    const CombinedCaves  = [...AllCaves, ...ExtraCaves];

    // 1. Subtractive 3D cave clusters (SmoothMax against the terrain SDF + heightmap mouth cutout).
    const Clusters = ClusterCaves(CombinedCaves);
    const FloorLimit = (Field.Minimum || 0.0) - 18.0;

    for (const Cluster of Clusters)
    {
        const Items = Cluster.Items;
        const LipBlend = Cluster.Blend;

        const CombinedCaveDistance = (Px, Py, Pz) =>
        {
            let Dist = CaveDistance(Items[0], Px, Py, Pz);
            for (let Index = 1; Index < Items.length; Index++)
                Dist = SmoothMin(Dist, CaveDistance(Items[Index], Px, Py, Pz), LipBlend * 0.75);
            return Dist;
        };

        // Mark heightmap texels whose surface is breached by this cave mouth so TerrainFragmentGlsl
        // discards the heightmap lid right over the entrance.
        if (Cutout)
        {
            const MinTx = Math.max(0, Math.floor(((Cluster.MinX / WorldExtent) + 0.5) * Resolution));
            const MaxTx = Math.min(Resolution - 1, Math.ceil(((Cluster.MaxX / WorldExtent) + 0.5) * Resolution));
            const MinTz = Math.max(0, Math.floor(((Cluster.MinZ / WorldExtent) + 0.5) * Resolution));
            const MaxTz = Math.min(Resolution - 1, Math.ceil(((Cluster.MaxZ / WorldExtent) + 0.5) * Resolution));
            const CutThreshold = LipBlend * 0.38;
            for (let Tz = MinTz; Tz <= MaxTz; Tz++)
            {
                const Wz = (Tz + 0.5) * TexelSize - WorldExtent * 0.5;
                for (let Tx = MinTx; Tx <= MaxTx; Tx++)
                {
                    const Wx = (Tx + 0.5) * TexelSize - WorldExtent * 0.5;
                    const Hy = Field.Heights[Tz * Resolution + Tx];
                    const D0 = CombinedCaveDistance(Wx, Hy, Wz);
                    const D1 = CombinedCaveDistance(Wx, Hy - 2.2, Wz);
                    const D  = Math.min(D0, D1);
                    if (D < CutThreshold)
                    {
                        const Weight = Math.min(Math.max(1.0 - D / CutThreshold, 0.0), 1.0);
                        const Idx = Tz * Resolution + Tx;
                        if (Weight > Cutout[Idx])
                            Cutout[Idx] = Weight;
                    }
                }
            }
        }

        const FieldAt = (Px, Py, Pz) =>
        {
            const DCave = CombinedCaveDistance(Px, Py, Pz);
            const H0 = Field.HeightAt(Px, Pz);
            // At the cave rim (DCave <= 0.35 * LipBlend), sit 0.28 m proud of the heightmap so the
            // rounded cave arch covers the cutout border seamlessly; far outside, tuck +0.55 m under.
            let LipT = (DCave - LipBlend * 0.35) / (LipBlend * 1.10);
            LipT = LipT < 0.0 ? 0.0 : LipT > 1.0 ? 1.0 : LipT;
            LipT = LipT * LipT * (3.0 - 2.0 * LipT);
            const SkinOffset = -0.28 + LipT * 0.85;
            const TerrainD = (Py - H0) + SkinOffset;
            let Carved = SmoothMax(TerrainD, -DCave, LipBlend * 0.65);
            // Keep a solid basement floor under deep caves.
            Carved = SmoothMin(Carved, -(FloorLimit - Py), 4.0);
            return Carved;
        };

        const Voxel = Math.min(Math.max(LipBlend / 4.5, 1.4), 2.6);
        const KeepCaveVertex = (Vx, Vy, Vz) => CombinedCaveDistance(Vx, Vy, Vz) < LipBlend * 0.92;
        PolygoniseVolume(
            Cluster.MinX, Cluster.MaxX,
            Cluster.MinY, Cluster.MaxY,
            Cluster.MinZ, Cluster.MaxZ,
            Voxel, FieldAt, Positions, Normals, Indices, KeepCaveVertex);
    }

    // 2. Additive SDF overhang features (arches, spires, crags, fins).
    for (const Stamp of AdditiveStamps)
    {
        const BaseY = Field.HeightAt(Stamp.X, Stamp.Z);
        const Reach = StampHeightReach(Stamp);
        const HalfPlan = Stamp.Scale * 0.66;
        const MinX = Stamp.X - HalfPlan, MaxX = Stamp.X + HalfPlan;
        const MinZ = Stamp.Z - HalfPlan, MaxZ = Stamp.Z + HalfPlan;
        const MinY = BaseY - Stamp.Sink - Stamp.Scale * 0.28;
        const MaxY = BaseY + Reach + Stamp.Scale * 0.10;
        const Voxel = Math.min(Math.max(Stamp.Scale / 58.0, 0.9), 4.0);

        const FieldAt = (Px, Py, Pz) =>
        {
            const TerrainD = (Py - Field.HeightAt(Px, Pz)) + Shrink;
            return SmoothMin(TerrainD, StampDistance(Stamp, Px, Py, Pz, BaseY), Stamp.Blend);
        };

        PolygoniseVolume(MinX, MaxX, MinY, MaxY, MinZ, MaxZ, Voxel, FieldAt, Positions, Normals, Indices);
    }

    return {
        Positions: new Float32Array(Positions),
        Normals:   new Float32Array(Normals),
        Indices:   new Uint32Array(Indices),
    };
}
