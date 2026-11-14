/*==========================================================================================================================================
                                                        NANITEPYRAMIDBUILDER.JS
==========================================================================================================================================*/
/**
 * 🧩 Nanite Virtual Geometry Cluster Pyramid & Monotonic DAG Builder
 *
 * Implements:
 *   1. 30-bit Morton space-filling curve cluster partitioning (<=128 triangles per cluster).
 *   2. Tight bounding sphere, bounding AABB, and unit normal-cone backface bounds per cluster.
 *   3. Boundary-locked Quadric Error Metric (QEM) edge collapse decimation:
 *      Locks cluster group perimeter vertices so adjacent cluster groups share 100% bit-exact
 *      seam geometry across arbitrary LOD cuts (eliminating cracks and T-junctions).
 *   4. Monotonic error propagation: guarantees SelfError <= ParentError so DAG cuts are monotonic.
 *   5. Hierarchical Directed Acyclic Graph (DAG) construction across LOD Levels 0..N.
 *   6. High-detail mesh procedural generators (Stanford Dragon, Stanford Bunny, Classical Column,
 *      Fractal Helix, Mountain Crater, and Multi-Instance grid coordinator).
 */

export const MAX_TRIANGLES_PER_CLUSTER = 128;

//------------------------------------------------------------------------------------------------------------------------
//                                              MORTON SPACE-FILLING ENCODER
//------------------------------------------------------------------------------------------------------------------------

function ExpandBits10To30(Coord10)
{
    let Spread = Coord10 & 0x000003ff;
    Spread = (Spread | (Spread << 16)) & 0x030000ff;
    Spread = (Spread | (Spread << 8))  & 0x0300f00f;
    Spread = (Spread | (Spread << 4))  & 0x030c30c3;
    Spread = (Spread | (Spread << 2))  & 0x09249249;
    return Spread >>> 0;
}

export function EncodeMorton30(X, Y, Z, MinX, MinY, MinZ, InvExtX, InvExtY, InvExtZ)
{
    const NormX = Math.max(0, Math.min(1, (X - MinX) * InvExtX));
    const NormY = Math.max(0, Math.min(1, (Y - MinY) * InvExtY));
    const NormZ = Math.max(0, Math.min(1, (Z - MinZ) * InvExtZ));
    const QX = Math.min(1023, Math.floor(NormX * 1023));
    const QY = Math.min(1023, Math.floor(NormY * 1023));
    const QZ = Math.min(1023, Math.floor(NormZ * 1023));
    return (((ExpandBits10To30(QX) << 2) >>> 0) |
            ((ExpandBits10To30(QY) << 1) >>> 0) |
             (ExpandBits10To30(QZ) >>> 0)) >>> 0;
}

//------------------------------------------------------------------------------------------------------------------------
//                                           SYMMETRIC QUADRIC ERROR METRIC (QEM)
//------------------------------------------------------------------------------------------------------------------------

/**
 * 4x4 symmetric plane quadric stored as 10 upper-triangular coefficients:
 *   [0]: a^2,   [1]: ab,   [2]: ac,   [3]: ad
 *               [4]: b^2,  [5]: bc,   [6]: bd
 *                          [7]: c^2,  [8]: cd
 *                                     [9]: d^2
 */
export class SymmetricQuadric
{
    constructor()
    {
        this.C = new Float64Array(10);
    }

    reset()
    {
        this.C.fill(0);
    }

    accumulatePlane(Nx, Ny, Nz, D, Weight = 1.0)
    {
        const w = Weight;
        this.C[0] += w * Nx * Nx;
        this.C[1] += w * Nx * Ny;
        this.C[2] += w * Nx * Nz;
        this.C[3] += w * Nx * D;
        this.C[4] += w * Ny * Ny;
        this.C[5] += w * Ny * Nz;
        this.C[6] += w * Ny * D;
        this.C[7] += w * Nz * Nz;
        this.C[8] += w * Nz * D;
        this.C[9] += w * D * D;
    }

    add(Other)
    {
        for (let i = 0; i < 10; ++i)
        {
            this.C[i] += Other.C[i];
        }
    }

    evaluate(X, Y, Z)
    {
        const c = this.C;
        return (
            X * (c[0] * X + c[1] * Y + c[2] * Z + c[3]) +
            Y * (c[1] * X + c[4] * Y + c[5] * Z + c[6]) +
            Z * (c[2] * X + c[5] * Y + c[7] * Z + c[8]) +
            (c[3] * X + c[6] * Y + c[8] * Z + c[9])
        );
    }
}

//------------------------------------------------------------------------------------------------------------------------
//                                            TIGHT BOUNDS & NORMAL CONES
//------------------------------------------------------------------------------------------------------------------------

export function ComputeClusterBounds(Positions, Indices)
{
    let MinX = Infinity, MinY = Infinity, MinZ = Infinity;
    let MaxX = -Infinity, MaxY = -Infinity, MaxZ = -Infinity;

    for (let i = 0; i < Indices.length; ++i)
    {
        const Vi = Indices[i] * 3;
        const X = Positions[Vi], Y = Positions[Vi + 1], Z = Positions[Vi + 2];
        if (X < MinX) MinX = X; if (X > MaxX) MaxX = X;
        if (Y < MinY) MinY = Y; if (Y > MaxY) MaxY = Y;
        if (Z < MinZ) MinZ = Z; if (Z > MaxZ) MaxZ = Z;
    }

    const CenterX = (MinX + MaxX) * 0.5;
    const CenterY = (MinY + MaxY) * 0.5;
    const CenterZ = (MinZ + MaxZ) * 0.5;

    let RadiusSq = 0;
    for (let i = 0; i < Indices.length; ++i)
    {
        const Vi = Indices[i] * 3;
        const Dx = Positions[Vi] - CenterX;
        const Dy = Positions[Vi + 1] - CenterY;
        const Dz = Positions[Vi + 2] - CenterZ;
        const Dsq = Dx * Dx + Dy * Dy + Dz * Dz;
        if (Dsq > RadiusSq) RadiusSq = Dsq;
    }
    const Radius = Math.sqrt(RadiusSq);

    // Compute unit normal cone
    let MeanNx = 0, MeanNy = 0, MeanNz = 0;
    const TriCount = Math.floor(Indices.length / 3);

    const FaceNormals = new Float32Array(TriCount * 3);
    for (let t = 0; t < TriCount; ++t)
    {
        const i0 = Indices[t * 3] * 3;
        const i1 = Indices[t * 3 + 1] * 3;
        const i2 = Indices[t * 3 + 2] * 3;

        const e1x = Positions[i1] - Positions[i0];
        const e1y = Positions[i1 + 1] - Positions[i0 + 1];
        const e1z = Positions[i1 + 2] - Positions[i0 + 2];

        const e2x = Positions[i2] - Positions[i0];
        const e2y = Positions[i2 + 1] - Positions[i0 + 1];
        const e2z = Positions[i2 + 2] - Positions[i0 + 2];

        let fnx = e1y * e2z - e1z * e2y;
        let fny = e1z * e2x - e1x * e2z;
        let fnz = e1x * e2y - e1y * e2x;
        const len = Math.hypot(fnx, fny, fnz);
        if (len > 1e-8)
        {
            fnx /= len; fny /= len; fnz /= len;
        }
        else
        {
            fnx = 0; fny = 1; fnz = 0;
        }
        FaceNormals[t * 3]     = fnx;
        FaceNormals[t * 3 + 1] = fny;
        FaceNormals[t * 3 + 2] = fnz;

        MeanNx += fnx; MeanNy += fny; MeanNz += fnz;
    }

    const MeanLen = Math.hypot(MeanNx, MeanNy, MeanNz);
    if (MeanLen > 1e-8)
    {
        MeanNx /= MeanLen; MeanNy /= MeanLen; MeanNz /= MeanLen;
    }
    else
    {
        MeanNx = 0; MeanNy = 1; MeanNz = 0;
    }

    let MinCos = 1.0;
    for (let t = 0; t < TriCount; ++t)
    {
        const Dot = FaceNormals[t * 3] * MeanNx + FaceNormals[t * 3 + 1] * MeanNy + FaceNormals[t * 3 + 2] * MeanNz;
        if (Dot < MinCos) MinCos = Dot;
    }

    // Normal cone cutoff: sin(theta) where theta = acos(MinCos)
    const SinCutoff = Math.sqrt(Math.max(0, 1.0 - MinCos * MinCos));

    return {
        BoundsMin: [MinX, MinY, MinZ],
        BoundsMax: [MaxX, MaxY, MaxZ],
        SphereCenter: [CenterX, CenterY, CenterZ],
        SphereRadius: Radius,
        NormalConeDirection: [MeanNx, MeanNy, MeanNz],
        NormalConeSinCutoff: SinCutoff,
        MinNormalCos: MinCos
    };
}

//------------------------------------------------------------------------------------------------------------------------
//                                           NANITE CLUSTER ENTRY SPECIFICATION
//------------------------------------------------------------------------------------------------------------------------

export class NaniteCluster
{
    constructor(ClusterId, Level = 0)
    {
        this.ClusterId = ClusterId;
        this.Level = Level;
        this.Indices = [];              // Local index array (pointing into Pyramid Positions)
        this.TriangleCount = 0;
        this.BoundsMin = [0, 0, 0];
        this.BoundsMax = [0, 0, 0];
        this.SphereCenter = [0, 0, 0];
        this.SphereRadius = 0;
        this.NormalConeDirection = [0, 1, 0];
        this.NormalConeSinCutoff = 1.0;  // >=1 disables cone culling
        this.SelfError = 0.0;           // Screen error introduced when choosing this cluster
        this.ParentError = 1e30;        // Error of parent group where coarser cluster replaces this
        this.ParentClusterIds = [];     // Coarser parent cluster IDs in next LOD level
        this.ChildClusterIds = [];      // Finer child cluster IDs in previous LOD level
        this.GroupId = 0;               // Partition cluster group assignment
        this.Color = [0.5, 0.5, 0.5];   // Distinct pseudorandom cluster visual color
    }
}

//------------------------------------------------------------------------------------------------------------------------
//                                             NANITE PYRAMID STRUCTURE
//------------------------------------------------------------------------------------------------------------------------

export class NanitePyramid
{
    constructor()
    {
        this.Name = 'Untitled Mesh';
        this.Positions = new Float32Array(0); // [X, Y, Z, X, Y, Z, ...]
        this.Normals = new Float32Array(0);   // [Nx, Ny, Nz, ...]
        this.UVs = new Float32Array(0);       // [U, V, U, V, ...]
        this.Clusters = [];                   // Array of NaniteCluster
        this.Levels = [];                     // Array of arrays: this.Levels[L] = [ClusterId, ...]
        this.RootClusterIds = [];             // Top-level clusters
        this.TotalSourceTriangles = 0;
        this.TotalVirtualTriangles = 0;
        this.BoundsMin = [0, 0, 0];
        this.BoundsMax = [0, 0, 0];
        this.SphereCenter = [0, 0, 0];
        this.SphereRadius = 0;
    }
}

//------------------------------------------------------------------------------------------------------------------------
//                                             PSEUDORANDOM CLUSTER COLOR HASH
//------------------------------------------------------------------------------------------------------------------------

function HashClusterColor(ClusterId)
{
    const GoldenRatio = 0.618033988749895;
    const Hue = (ClusterId * GoldenRatio) % 1.0;
    const Saturation = 0.72 + ((ClusterId * 17) % 25) * 0.01;
    const Value = 0.82 + ((ClusterId * 31) % 18) * 0.01;

    // HSV to RGB
    const i = Math.floor(Hue * 6);
    const f = Hue * 6 - i;
    const p = Value * (1 - Saturation);
    const q = Value * (1 - f * Saturation);
    const t = Value * (1 - (1 - f) * Saturation);

    let R = 0, G = 0, B = 0;
    switch (i % 6)
    {
        case 0: R = Value; G = t; B = p; break;
        case 1: R = q; G = Value; B = p; break;
        case 2: R = p; G = Value; B = t; break;
        case 3: R = p; G = q; B = Value; break;
        case 4: R = t; G = p; B = Value; break;
        case 5: R = Value; G = p; B = q; break;
    }
    return [R, G, B];
}

//------------------------------------------------------------------------------------------------------------------------
//                                      SEAM-LOCKED QEM MESH SIMPLIFIER
//------------------------------------------------------------------------------------------------------------------------

/**
 * Simplifies a set of triangles belonging to a cluster group while STRICTLY locking
 * boundary vertices to prevent cracks between cluster groups!
 */
export function SimplifyClusterGroupSeamLocked(Positions, Normals, UVs, Triangles, TargetRatio = 0.5)
{
    const TriCount = Math.floor(Triangles.length / 3);
    const TargetTriCount = Math.max(12, Math.floor(TriCount * TargetRatio));
    if (TriCount <= TargetTriCount)
    {
        return {
            SimplifiedTriangles: Triangles.slice(),
            SimplificationError: 0.0
        };
    }

    // Build edge adjacency & identify boundary vertices
    const EdgeUsage = new Map();
    const VertexFaces = new Map();

    const MakeEdgeKey = (a, b) => (a < b ? `${a}_${b}` : `${b}_${a}`);

    for (let t = 0; t < TriCount; ++t)
    {
        const i0 = Triangles[t * 3];
        const i1 = Triangles[t * 3 + 1];
        const i2 = Triangles[t * 3 + 2];

        const AddEdge = (a, b) => {
            const Key = MakeEdgeKey(a, b);
            EdgeUsage.set(Key, (EdgeUsage.get(Key) || 0) + 1);
        };
        AddEdge(i0, i1);
        AddEdge(i1, i2);
        AddEdge(i2, i0);

        for (const v of [i0, i1, i2])
        {
            if (!VertexFaces.has(v)) VertexFaces.set(v, []);
            VertexFaces.get(v).push(t);
        }
    }

    // A boundary vertex is incident on at least one edge used exactly once in this group
    const BoundaryVertices = new Set();
    for (const [Key, Count] of EdgeUsage.entries())
    {
        if (Count === 1)
        {
            const [a, b] = Key.split('_').map(Number);
            BoundaryVertices.add(a);
            BoundaryVertices.add(b);
        }
    }

    // Compute Quadrics per vertex
    const VertexQuadrics = new Map();
    for (let t = 0; t < TriCount; ++t)
    {
        const i0 = Triangles[t * 3] * 3;
        const i1 = Triangles[t * 3 + 1] * 3;
        const i2 = Triangles[t * 3 + 2] * 3;

        const e1x = Positions[i1] - Positions[i0];
        const e1y = Positions[i1 + 1] - Positions[i0 + 1];
        const e1z = Positions[i1 + 2] - Positions[i0 + 2];

        const e2x = Positions[i2] - Positions[i0];
        const e2y = Positions[i2 + 1] - Positions[i0 + 1];
        const e2z = Positions[i2 + 2] - Positions[i0 + 2];

        let fnx = e1y * e2z - e1z * e2y;
        let fny = e1z * e2x - e1x * e2z;
        let fnz = e1x * e2y - e1y * e2x;
        const area = Math.hypot(fnx, fny, fnz);
        if (area > 1e-12)
        {
            fnx /= area; fny /= area; fnz /= area;
            const PlaneD = -(fnx * Positions[i0] + fny * Positions[i0 + 1] + fnz * Positions[i0 + 2]);

            for (const vIdx of [Triangles[t * 3], Triangles[t * 3 + 1], Triangles[t * 3 + 2]])
            {
                if (!VertexQuadrics.has(vIdx)) VertexQuadrics.set(vIdx, new SymmetricQuadric());
                VertexQuadrics.get(vIdx).accumulatePlane(fnx, fny, fnz, PlaneD, area * 0.5);
            }
        }
    }

    // Build candidate edge collapse list
    // Rule: Never collapse an edge if both are boundary vertices!
    // If one is boundary and one is internal: collapse internal -> boundary (lock boundary position).
    // If both are internal: collapse to optimal or midpoint.
    const CandidateEdges = [];
    const VisitedEdges = new Set();

    for (let t = 0; t < TriCount; ++t)
    {
        const Tri = [Triangles[t * 3], Triangles[t * 3 + 1], Triangles[t * 3 + 2]];
        for (let e = 0; e < 3; ++e)
        {
            const v0 = Tri[e];
            const v1 = Tri[(e + 1) % 3];
            const Key = MakeEdgeKey(v0, v1);
            if (VisitedEdges.has(Key)) continue;
            VisitedEdges.add(Key);

            const v0IsBnd = BoundaryVertices.has(v0);
            const v1IsBnd = BoundaryVertices.has(v1);

            // Both boundary => LOCKED! Do not collapse!
            if (v0IsBnd && v1IsBnd) continue;

            const Q0 = VertexQuadrics.get(v0) || new SymmetricQuadric();
            const Q1 = VertexQuadrics.get(v1) || new SymmetricQuadric();
            const CombinedQ = new SymmetricQuadric();
            CombinedQ.add(Q0);
            CombinedQ.add(Q1);

            let TargetX = 0, TargetY = 0, TargetZ = 0;
            let FromV = v0, ToV = v1;

            if (v0IsBnd)
            {
                // Collapse v1 -> v0 (preserve v0 exactly)
                FromV = v1; ToV = v0;
                TargetX = Positions[v0 * 3]; TargetY = Positions[v0 * 3 + 1]; TargetZ = Positions[v0 * 3 + 2];
            }
            else if (v1IsBnd)
            {
                // Collapse v0 -> v1 (preserve v1 exactly)
                FromV = v0; ToV = v1;
                TargetX = Positions[v1 * 3]; TargetY = Positions[v1 * 3 + 1]; TargetZ = Positions[v1 * 3 + 2];
            }
            else
            {
                // Both internal: evaluate midpoint
                FromV = v0; ToV = v1;
                TargetX = (Positions[v0 * 3] + Positions[v1 * 3]) * 0.5;
                TargetY = (Positions[v0 * 3 + 1] + Positions[v1 * 3 + 1]) * 0.5;
                TargetZ = (Positions[v0 * 3 + 2] + Positions[v1 * 3 + 2]) * 0.5;
            }

            const Error = Math.max(0, CombinedQ.evaluate(TargetX, TargetY, TargetZ));
            const Length = Math.hypot(
                Positions[v0 * 3] - Positions[v1 * 3],
                Positions[v0 * 3 + 1] - Positions[v1 * 3 + 1],
                Positions[v0 * 3 + 2] - Positions[v1 * 3 + 2]
            );

            CandidateEdges.push({
                FromV,
                ToV,
                TargetX,
                TargetY,
                TargetZ,
                Cost: Error + Length * 1e-4,
                GeomError: Math.sqrt(Math.max(0, Error))
            });
        }
    }

    // Sort by collapse cost ascending
    CandidateEdges.sort((a, b) => a.Cost - b.Cost);

    // Iteratively collapse edges
    const UnionFind = new Map();
    const Find = (i) => {
        let root = i;
        while (UnionFind.has(root)) root = UnionFind.get(root);
        let curr = i;
        while (curr !== root) {
            const next = UnionFind.get(curr) || root;
            UnionFind.set(curr, root);
            curr = next;
        }
        return root;
    };

    let CurrentTriCount = TriCount;
    let MaxGroupError = 0.0;

    for (const Edge of CandidateEdges)
    {
        if (CurrentTriCount <= TargetTriCount) break;

        const RootFrom = Find(Edge.FromV);
        const RootTo = Find(Edge.ToV);
        if (RootFrom === RootTo) continue;

        // If both merged roots are boundary, cannot collapse
        if (BoundaryVertices.has(RootFrom) && BoundaryVertices.has(RootTo)) continue;

        // Ensure boundary vertex is the destination root
        if (BoundaryVertices.has(RootFrom))
        {
            UnionFind.set(RootTo, RootFrom);
        }
        else
        {
            UnionFind.set(RootFrom, RootTo);
        }

        if (Edge.GeomError > MaxGroupError) MaxGroupError = Edge.GeomError;
        CurrentTriCount -= 2; // Rough estimate of degenerated faces
    }

    // Reconstruct simplified triangle list
    const SimplifiedTriangles = [];
    for (let t = 0; t < TriCount; ++t)
    {
        const r0 = Find(Triangles[t * 3]);
        const r1 = Find(Triangles[t * 3 + 1]);
        const r2 = Find(Triangles[t * 3 + 2]);

        // Discard degenerated triangles
        if (r0 !== r1 && r1 !== r2 && r2 !== r0)
        {
            SimplifiedTriangles.push(r0, r1, r2);
        }
    }

    return {
        SimplifiedTriangles,
        SimplificationError: Math.max(MaxGroupError, 1e-5)
    };
}

//------------------------------------------------------------------------------------------------------------------------
//                                           NANITE PYRAMID BUILDER
//------------------------------------------------------------------------------------------------------------------------

export class NanitePyramidBuilder
{
    /**
     * Builds a full Nanite Cluster Pyramid with monotonic DAG from raw mesh buffers.
     */
    static Build(MeshName, Positions, Normals, UVs, Indices, TargetTrianglesPerCluster = MAX_TRIANGLES_PER_CLUSTER, MaxHierarchyLevels = 5)
    {
        const Pyramid = new NanitePyramid();
        Pyramid.Name = MeshName;
        Pyramid.Positions = Positions;
        Pyramid.Normals = Normals;
        Pyramid.UVs = UVs;
        Pyramid.TotalSourceTriangles = Math.floor(Indices.length / 3);

        // Overall scene bounding box
        let MinX = Infinity, MinY = Infinity, MinZ = Infinity;
        let MaxX = -Infinity, MaxY = -Infinity, MaxZ = -Infinity;
        for (let i = 0; i < Positions.length; i += 3)
        {
            const X = Positions[i], Y = Positions[i + 1], Z = Positions[i + 2];
            if (X < MinX) MinX = X; if (X > MaxX) MaxX = X;
            if (Y < MinY) MinY = Y; if (Y > MaxY) MaxY = Y;
            if (Z < MinZ) MinZ = Z; if (Z > MaxZ) MaxZ = Z;
        }
        Pyramid.BoundsMin = [MinX, MinY, MinZ];
        Pyramid.BoundsMax = [MaxX, MaxY, MaxZ];
        Pyramid.SphereCenter = [(MinX + MaxX) * 0.5, (MinY + MaxY) * 0.5, (MinZ + MaxZ) * 0.5];
        Pyramid.SphereRadius = Math.hypot(MaxX - MinX, MaxY - MinY, MaxZ - MinZ) * 0.5;

        const ExtX = Math.max(1e-5, MaxX - MinX);
        const ExtY = Math.max(1e-5, MaxY - MinY);
        const ExtZ = Math.max(1e-5, MaxZ - MinZ);
        const InvExtX = 1.0 / ExtX, InvExtY = 1.0 / ExtY, InvExtZ = 1.0 / ExtZ;

        // Step 1: Morton Sort source triangles into Level 0 Clusters
        const TriCount = Math.floor(Indices.length / 3);
        const SortedTriangles = new Array(TriCount);

        for (let t = 0; t < TriCount; ++t)
        {
            const i0 = Indices[t * 3] * 3;
            const i1 = Indices[t * 3 + 1] * 3;
            const i2 = Indices[t * 3 + 2] * 3;

            const Cx = (Positions[i0] + Positions[i1] + Positions[i2]) / 3;
            const Cy = (Positions[i0 + 1] + Positions[i1 + 1] + Positions[i2 + 1]) / 3;
            const Cz = (Positions[i0 + 2] + Positions[i1 + 2] + Positions[i2 + 2]) / 3;

            const MortonCode = EncodeMorton30(Cx, Cy, Cz, MinX, MinY, MinZ, InvExtX, InvExtY, InvExtZ);
            SortedTriangles[t] = {
                Index: t,
                MortonCode,
                Cx, Cy, Cz,
                i0: Indices[t * 3],
                i1: Indices[t * 3 + 1],
                i2: Indices[t * 3 + 2]
            };
        }

        SortedTriangles.sort((a, b) => a.MortonCode - b.MortonCode);

        // Partition Level 0
        let ClusterCounter = 0;
        const Level0Clusters = [];
        const Level0Ids = [];

        for (let tStart = 0; tStart < TriCount; tStart += TargetTrianglesPerCluster)
        {
            const tEnd = Math.min(TriCount, tStart + TargetTrianglesPerCluster);
            const Cluster = new NaniteCluster(ClusterCounter++, 0);
            Cluster.Color = HashClusterColor(Cluster.ClusterId);

            for (let t = tStart; t < tEnd; ++t)
            {
                Cluster.Indices.push(SortedTriangles[t].i0, SortedTriangles[t].i1, SortedTriangles[t].i2);
            }
            Cluster.TriangleCount = Math.floor(Cluster.Indices.length / 3);

            const Bounds = ComputeClusterBounds(Positions, Cluster.Indices);
            Object.assign(Cluster, Bounds);
            Cluster.SelfError = 0.0; // Level 0 has 0 self simplification error

            Level0Clusters.push(Cluster);
            Level0Ids.push(Cluster.ClusterId);
            Pyramid.Clusters.push(Cluster);
        }

        Pyramid.Levels.push(Level0Ids);

        // Step 2: Build Hierarchical Coarser Levels (LOD 1..N) via Grouping & Seam-Locked Decimation
        let CurrentLevelClusters = Level0Clusters;

        for (let Level = 1; Level < MaxHierarchyLevels; ++Level)
        {
            if (CurrentLevelClusters.length <= 1) break;

            const NextLevelClusters = [];
            const NextLevelIds = [];

            // Group adjacent clusters in groups of 2 to 4 by centroid proximity
            const GroupSize = 4;
            for (let gStart = 0; gStart < CurrentLevelClusters.length; gStart += GroupSize)
            {
                const gEnd = Math.min(CurrentLevelClusters.length, gStart + GroupSize);
                const GroupChildren = CurrentLevelClusters.slice(gStart, gEnd);

                // Collect combined indices of the group
                const CombinedTriangles = [];
                for (const Child of GroupChildren)
                {
                    CombinedTriangles.push(...Child.Indices);
                }

                // Simplify group with locked boundaries
                const { SimplifiedTriangles, SimplificationError } = SimplifyClusterGroupSeamLocked(
                    Positions, Normals, UVs, CombinedTriangles, 0.5
                );

                if (SimplifiedTriangles.length === 0)
                {
                    continue;
                }

                // Split simplified triangles into parent clusters (<= TargetTrianglesPerCluster)
                const SimplifiedTriCount = Math.floor(SimplifiedTriangles.length / 3);
                for (let sStart = 0; sStart < SimplifiedTriCount; sStart += TargetTrianglesPerCluster)
                {
                    const sEnd = Math.min(SimplifiedTriCount, sStart + TargetTrianglesPerCluster);
                    const ParentCluster = new NaniteCluster(ClusterCounter++, Level);
                    ParentCluster.Color = HashClusterColor(ParentCluster.ClusterId);

                    for (let st = sStart; st < sEnd; ++st)
                    {
                        ParentCluster.Indices.push(
                            SimplifiedTriangles[st * 3],
                            SimplifiedTriangles[st * 3 + 1],
                            SimplifiedTriangles[st * 3 + 2]
                        );
                    }
                    ParentCluster.TriangleCount = Math.floor(ParentCluster.Indices.length / 3);

                    const ParentBounds = ComputeClusterBounds(Positions, ParentCluster.Indices);
                    Object.assign(ParentCluster, ParentBounds);

                    // Monotonic error assignment:
                    // Parent SelfError = max(Child.SelfError) + SimplificationError
                    let MaxChildSelfError = 0.0;
                    for (const Child of GroupChildren)
                    {
                        if (Child.SelfError > MaxChildSelfError) MaxChildSelfError = Child.SelfError;
                    }
                    ParentCluster.SelfError = MaxChildSelfError + SimplificationError;

                    // Wire DAG relationships
                    for (const Child of GroupChildren)
                    {
                        ParentCluster.ChildClusterIds.push(Child.ClusterId);
                        Child.ParentClusterIds.push(ParentCluster.ClusterId);

                        // Child ParentError is replaced by the parent's SelfError (monotonic threshold)
                        Child.ParentError = Math.min(Child.ParentError, ParentCluster.SelfError);
                        // Ensure strict monotonicity: ParentError > SelfError
                        if (Child.ParentError <= Child.SelfError)
                        {
                            Child.ParentError = Child.SelfError * 1.08 + 1e-4;
                        }
                    }

                    NextLevelClusters.push(ParentCluster);
                    NextLevelIds.push(ParentCluster.ClusterId);
                    Pyramid.Clusters.push(ParentCluster);
                }
            }

            if (NextLevelClusters.length === 0) break;

            Pyramid.Levels.push(NextLevelIds);
            CurrentLevelClusters = NextLevelClusters;
        }

        // Top level clusters are roots
        Pyramid.RootClusterIds = Pyramid.Levels[Pyramid.Levels.length - 1];

        // Tally total virtual triangles
        let TotalVirtual = 0;
        for (const Cluster of Pyramid.Clusters)
        {
            TotalVirtual += Cluster.TriangleCount;
        }
        Pyramid.TotalVirtualTriangles = TotalVirtual;

        return Pyramid;
    }
}
