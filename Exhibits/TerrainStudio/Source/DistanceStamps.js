//============================================================================================================================================
//                                                              DISTANCESTAMPS.JS
//============================================================================================================================================
// 🧩 The voxel half of the generator: analytic signed-distance stamps (arch, spire, crag, fin) unioned
//    against the heightfield's own distance approximation, then polygonised with surface nets. This is
//    where overhangs come from — things a heightfield alone can never represent.
//
// 📝 The combined field is  F(p) = smin( (p.y − H(p.xz)) + shrink , stamp(p), blend ). The shrink pulls
//    the voxel surface a few decimetres under the heightfield skin, so where a stamp changes nothing its
//    surface hides below the terrain; where it grows an arch, the union breaks through seamlessly.
//    Each stamp polygonises over its own bounds at a voxel size tied to its scale — a 100 m arch gets
//    ~1.8 m voxels, not the 8 m a whole-world grid would force.

import { LatticeNoise, ConstructRandomStream } from "./ReliefField.js";

const Shrink = 0.4;   // [m] how far the voxel skin tucks beneath the heightfield

export const StampShapes =
[
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

function SmoothMin(A, B, K)
{
    const H = Math.min(Math.max(0.5 + 0.5 * (B - A) / K, 0.0), 1.0);
    return B + (A - B) * H - K * H * (1.0 - H);
}

//--------------------------------------------------------------------------------------------------------------------------------------------
//                                                                  PRIMITIVE DISTANCES
//--------------------------------------------------------------------------------------------------------------------------------------------

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
    // Rounded capped cone (Quilez closed form), bent a few degrees off plumb.
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

const RuggedNoise = new LatticeNoise(4242);

export function StampDistance(Stamp, WorldX, WorldY, WorldZ, BaseY)
{
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

    // Break the analytic smoothness so stamps read as rock, not turned wood.
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
        default:      return Stamp.Scale * 0.44;   // Arch: ring radius + tube
    }
}

//--------------------------------------------------------------------------------------------------------------------------------------------
//                                                                  SURFACE NETS
//--------------------------------------------------------------------------------------------------------------------------------------------

// 📝 Naive surface nets over each stamp's bounds: one vertex per sign-changing cell (the average of its
//    edge crossings), quads across every sign-changing grid edge. Winding is verified against the SDF
//    gradient normals, so orientation never depends on a hand-derived table being right.

export function PolygoniseStamps(Field, Stamps)
{
    const Positions = [];
    const Normals   = [];
    const Indices   = [];

    for (const Stamp of Stamps)
    {
        const BaseY = Field.HeightAt(Stamp.X, Stamp.Z);
        const Reach = StampHeightReach(Stamp);
        const HalfPlan = Stamp.Scale * 0.66;
        const MinX = Stamp.X - HalfPlan, MaxX = Stamp.X + HalfPlan;
        const MinZ = Stamp.Z - HalfPlan, MaxZ = Stamp.Z + HalfPlan;
        const MinY = BaseY - Stamp.Sink - Stamp.Scale * 0.28;
        const MaxY = BaseY + Reach + Stamp.Scale * 0.10;

        const Voxel = Math.min(Math.max(Stamp.Scale / 58.0, 0.9), 4.0);
        const DimX = Math.max(4, Math.min(Math.ceil((MaxX - MinX) / Voxel), 130));
        const DimY = Math.max(4, Math.min(Math.ceil((MaxY - MinY) / Voxel), 130));
        const DimZ = Math.max(4, Math.min(Math.ceil((MaxZ - MinZ) / Voxel), 130));
        const StepX = (MaxX - MinX) / DimX;
        const StepY = (MaxY - MinY) / DimY;
        const StepZ = (MaxZ - MinZ) / DimZ;

        const FieldAt = (Px, Py, Pz) =>
        {
            const TerrainD = (Py - Field.HeightAt(Px, Pz)) + Shrink;
            return SmoothMin(TerrainD, StampDistance(Stamp, Px, Py, Pz, BaseY), Stamp.Blend);
        };

        // Node lattice, (Dim+1)³ samples.
        const NodeCountX = DimX + 1;
        const NodeCountY = DimY + 1;
        const NodeStride = NodeCountX * NodeCountY;
        const Lattice = new Float32Array(NodeCountX * NodeCountY * (DimZ + 1));
        for (let Kz = 0; Kz <= DimZ; Kz++)
        {
            for (let Ky = 0; Ky <= DimY; Ky++)
            {
                for (let Kx = 0; Kx <= DimX; Kx++)
                {
                    Lattice[Kz * NodeStride + Ky * NodeCountX + Kx] =
                        FieldAt(MinX + Kx * StepX, MinY + Ky * StepY, MinZ + Kz * StepZ);
                }
            }
        }
        const NodeAt = (Kx, Ky, Kz) => Lattice[Kz * NodeStride + Ky * NodeCountX + Kx];

        // One vertex per mixed-sign cell.
        const CellVertex = new Int32Array(DimX * DimY * DimZ).fill(-1);
        const CornerOffsets =
        [
            [0,0,0],[1,0,0],[0,1,0],[1,1,0],
            [0,0,1],[1,0,1],[0,1,1],[1,1,1],
        ];
        const EdgePairs =
        [
            [0,1],[2,3],[4,5],[6,7],   // X edges
            [0,2],[1,3],[4,6],[5,7],   // Y edges
            [0,4],[1,5],[2,6],[3,7],   // Z edges
        ];
        const VertexBase = Positions.length / 3;

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

                    // Outward normal from the field gradient.
                    const Eps = Voxel * 0.6;
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
            // Orient with the averaged gradient normal.
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

        // Quads across sign-changing edges along each axis.
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
        void VertexBase;
    }

    return {
        Positions: new Float32Array(Positions),
        Normals:   new Float32Array(Normals),
        Indices:   new Uint32Array(Indices),
    };
}
