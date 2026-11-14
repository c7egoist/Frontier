// Offline builder for the virtual-geometry cluster hierarchy (Nanite-style DAG), the
// classic discrete LOD chain, and the per-level bounding-volume tree used for culling.
//
//   Level 0   source triangles ── graph bisection ──► clusters (≤ ClusterSize triangles)
//   Level n   clusters ── weighted graph bisection ──► groups (≤ GroupSize clusters)
//             group ── lock seam vertices, QEM simplify to ½ ──► re-cluster ──► level n+1
//
// Invariants enforced (verified by ClusterHierarchyValidation.mjs):
//   • every input cluster of a group carries the group's (ParentError, ParentSphere);
//     every output cluster carries the same pair as (SelfError, SelfSphere) — so the
//     runtime test "Self ≤ τ < Parent" always swaps a whole group at once → no cracks;
//   • group error = max(simplify error, input errors) and group sphere encloses input
//     self spheres → projected error is monotonic along every DAG path.

import { SimplifyTriangles } from "./QuadricSimplifier.js";
import { PartitionWeightedGraph, ConstructTriangleGraph } from "./GraphPartitioner.js";
import { DeriveVertexNormals } from "./PolygonNetworkSources.js";
import { EncloseSpheres } from "./LinearAlgebra.js";

export const RootParentError = 1e30;
export const VertexWordStride = 6;
export const ClusterFloatStride = 20;
export const ClusterIntegerStride = 4;
export const BoundingNodeFloatStride = 16;
export const BoundingNodeIntegerStride = 4;
export const NoGroup = 0xffffffff;

// Exact float-bit position lookup (open addressing).
class PositionLookup {
    constructor(ExpectedCount) {
        let Capacity = 16;
        while (Capacity < ExpectedCount * 2) Capacity <<= 1;
        this.Slots = new Int32Array(Capacity).fill(-1);
        this.Positions = new Float32Array(Math.max(16, ExpectedCount) * 3);
        this.Count = 0;
        this.Scratch = new Float32Array(3);
        this.ScratchBits = new Uint32Array(this.Scratch.buffer);
    }
    Hash() {
        const B = this.ScratchBits;
        return (Math.imul(B[0], 73856093) ^ Math.imul(B[1], 19349663) ^ Math.imul(B[2], 83492791)) >>> 0;
    }
    Grow() {
        const OldPositions = this.Positions, OldCount = this.Count;
        this.Slots = new Int32Array(this.Slots.length * 2).fill(-1);
        this.Positions = new Float32Array(OldPositions.length * 2);
        this.Count = 0;
        for (let Index = 0; Index < OldCount; Index++) this.Insert(OldPositions[Index * 3], OldPositions[Index * 3 + 1], OldPositions[Index * 3 + 2]);
    }
    Find(X, Y, Z) {
        const S = this.Scratch;
        S[0] = X; S[1] = Y; S[2] = Z;
        const Mask = this.Slots.length - 1;
        let Slot = this.Hash() & Mask;
        for (;;) {
            const Held = this.Slots[Slot];
            if (Held < 0) return -1;
            const P = this.Positions;
            if (P[Held * 3] === S[0] && P[Held * 3 + 1] === S[1] && P[Held * 3 + 2] === S[2]) return Held;
            Slot = (Slot + 1) & Mask;
        }
    }
    Insert(X, Y, Z) {
        if ((this.Count + 1) * 2 > this.Slots.length || (this.Count + 1) * 3 > this.Positions.length) this.Grow();
        const S = this.Scratch;
        S[0] = X; S[1] = Y; S[2] = Z;
        const Mask = this.Slots.length - 1;
        let Slot = this.Hash() & Mask;
        for (;;) {
            const Held = this.Slots[Slot];
            if (Held < 0) {
                const Index = this.Count++;
                this.Slots[Slot] = Index;
                this.Positions[Index * 3] = S[0]; this.Positions[Index * 3 + 1] = S[1]; this.Positions[Index * 3 + 2] = S[2];
                return Index;
            }
            const P = this.Positions;
            if (P[Held * 3] === S[0] && P[Held * 3 + 1] === S[1] && P[Held * 3 + 2] === S[2]) return Held;
            Slot = (Slot + 1) & Mask;
        }
    }
}

function TightSphere(Positions, Indices) {
    let MinX = Infinity, MinY = Infinity, MinZ = Infinity, MaxX = -Infinity, MaxY = -Infinity, MaxZ = -Infinity;
    for (let Index = 0; Index < Indices.length; Index++) {
        const V = Indices[Index] * 3;
        const X = Positions[V], Y = Positions[V + 1], Z = Positions[V + 2];
        if (X < MinX) MinX = X; if (X > MaxX) MaxX = X;
        if (Y < MinY) MinY = Y; if (Y > MaxY) MaxY = Y;
        if (Z < MinZ) MinZ = Z; if (Z > MaxZ) MaxZ = Z;
    }
    const Cx = (MinX + MaxX) / 2, Cy = (MinY + MaxY) / 2, Cz = (MinZ + MaxZ) / 2;
    let Radius = 0;
    for (let Index = 0; Index < Indices.length; Index++) {
        const V = Indices[Index] * 3;
        Radius = Math.max(Radius, Math.hypot(Positions[V] - Cx, Positions[V + 1] - Cy, Positions[V + 2] - Cz));
    }
    return [Cx, Cy, Cz, Radius * (1 + 1e-6) + 1e-9];
}

// Backface normal cone (meshoptimizer convention: cutoff = sin of the cone half-angle; 1 disables).
function NormalCone(Positions, Indices) {
    let Ax = 0, Ay = 0, Az = 0;
    const Normals = [];
    for (let Index = 0; Index < Indices.length; Index += 3) {
        const A = Indices[Index] * 3, B = Indices[Index + 1] * 3, C = Indices[Index + 2] * 3;
        const Ux = Positions[B] - Positions[A], Uy = Positions[B + 1] - Positions[A + 1], Uz = Positions[B + 2] - Positions[A + 2];
        const Vx = Positions[C] - Positions[A], Vy = Positions[C + 1] - Positions[A + 1], Vz = Positions[C + 2] - Positions[A + 2];
        const Nx = Uy * Vz - Uz * Vy, Ny = Uz * Vx - Ux * Vz, Nz = Ux * Vy - Uy * Vx;
        const Length = Math.hypot(Nx, Ny, Nz);
        if (Length < 1e-30) continue;
        Ax += Nx; Ay += Ny; Az += Nz;
        Normals.push(Nx / Length, Ny / Length, Nz / Length);
    }
    const Length = Math.hypot(Ax, Ay, Az);
    if (Length < 1e-30 || Normals.length === 0) return [0, 0, 1, 1];
    Ax /= Length; Ay /= Length; Az /= Length;
    let MinAlignment = 1;
    for (let Index = 0; Index < Normals.length; Index += 3) {
        MinAlignment = Math.min(MinAlignment, Normals[Index] * Ax + Normals[Index + 1] * Ay + Normals[Index + 2] * Az);
    }
    if (MinAlignment <= 0.1) return [Ax, Ay, Az, 1];
    return [Ax, Ay, Az, Math.sqrt(1 - MinAlignment * MinAlignment)];
}

function PartitionTriangles(Positions, Indices, ClusterSize) {
    const Graph = ConstructTriangleGraph(Positions, Indices);
    const { PartOfVertex, PartCount } = PartitionWeightedGraph({ ...Graph, MaxPartSize: ClusterSize });
    const Counts = new Uint32Array(PartCount);
    for (let Triangle = 0; Triangle < PartOfVertex.length; Triangle++) Counts[PartOfVertex[Triangle]]++;
    const Parts = Array.from({ length: PartCount }, (_, Part) => new Uint32Array(Counts[Part] * 3));
    const Fill = new Uint32Array(PartCount);
    for (let Triangle = 0; Triangle < PartOfVertex.length; Triangle++) {
        const Part = PartOfVertex[Triangle];
        const Cursor = Fill[Part];
        Parts[Part][Cursor] = Indices[Triangle * 3];
        Parts[Part][Cursor + 1] = Indices[Triangle * 3 + 1];
        Parts[Part][Cursor + 2] = Indices[Triangle * 3 + 2];
        Fill[Part] += 3;
    }
    return Parts;
}

function OctEncodeNormal(X, Y, Z) {
    const L1 = Math.abs(X) + Math.abs(Y) + Math.abs(Z) || 1;
    let U = X / L1, V = Y / L1;
    if (Z < 0) {
        const Pu = (1 - Math.abs(V)) * (U >= 0 ? 1 : -1);
        const Pv = (1 - Math.abs(U)) * (V >= 0 ? 1 : -1);
        U = Pu; V = Pv;
    }
    const Su = Math.max(-32767, Math.min(32767, Math.round(U * 32767))) & 0xffff;
    const Sv = Math.max(-32767, Math.min(32767, Math.round(V * 32767))) & 0xffff;
    return (Su | (Sv << 16)) >>> 0;
}

function LevelNormals(Positions, Indices, SourceLookup, SourceNormals) {
    const Normals = DeriveVertexNormals(Positions, Indices);
    for (let Vertex = 0; Vertex < Positions.length / 3; Vertex++) {
        const Found = SourceLookup.Find(Positions[Vertex * 3], Positions[Vertex * 3 + 1], Positions[Vertex * 3 + 2]);
        if (Found >= 0) {
            Normals[Vertex * 3] = SourceNormals[Found * 3];
            Normals[Vertex * 3 + 1] = SourceNormals[Found * 3 + 1];
            Normals[Vertex * 3 + 2] = SourceNormals[Found * 3 + 2];
        }
    }
    return Normals;
}

export function BuildClusterHierarchy(Source, Options = {}, ReportProgress = () => {}) {
    const ClusterSize = Math.max(32, Math.min(256, Options.ClusterSize ?? 128));
    const GroupSize = Math.max(2, Math.min(32, Options.GroupSize ?? 8));
    const SimplifyRatio = Options.SimplifyRatio ?? 0.5;
    const MinReduction = Options.MinReduction ?? 0.15;
    const MaxLevels = Options.MaxLevels ?? 24;
    const BuildDiscreteChain = Options.BuildDiscreteChain ?? true;
    const Log = [];
    const Timings = {};
    const Clock = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
    let Mark = Clock();
    const Phase = (Name) => { const Now = Clock(); Timings[Name] = (Timings[Name] || 0) + Now - Mark; Mark = Now; };

    const SourcePositions = Source.Positions;
    const SourceIndices = Source.Indices;
    const SourceTriangleCount = SourceIndices.length / 3;
    const SourceNormals = DeriveVertexNormals(SourcePositions, SourceIndices);
    const SourceLookup = new PositionLookup(SourcePositions.length / 3);
    for (let Vertex = 0; Vertex < SourcePositions.length / 3; Vertex++) SourceLookup.Insert(SourcePositions[Vertex * 3], SourcePositions[Vertex * 3 + 1], SourcePositions[Vertex * 3 + 2]);
    // SourceLookup index equals source vertex index only if positions are unique (sources are welded).
    const SourceVertexOfLookup = new Int32Array(SourceLookup.Count);
    for (let Vertex = 0; Vertex < SourcePositions.length / 3; Vertex++) {
        SourceVertexOfLookup[SourceLookup.Find(SourcePositions[Vertex * 3], SourcePositions[Vertex * 3 + 1], SourcePositions[Vertex * 3 + 2])] = Vertex;
    }
    const RemappedSourceNormals = new Float32Array(SourceLookup.Count * 3);
    for (let Index = 0; Index < SourceLookup.Count; Index++) {
        const V = SourceVertexOfLookup[Index];
        RemappedSourceNormals[Index * 3] = SourceNormals[V * 3];
        RemappedSourceNormals[Index * 3 + 1] = SourceNormals[V * 3 + 1];
        RemappedSourceNormals[Index * 3 + 2] = SourceNormals[V * 3 + 2];
    }
    Log.push(`Source "${Source.Label}": ${SourceTriangleCount.toLocaleString()} triangles, ${(SourcePositions.length / 3).toLocaleString()} vertices`);
    ReportProgress("Partitioning level 0", 0.02);

    // ── Level 0 ────────────────────────────────────────────────────────────────
    const Clusters = [];
    const Groups = [];
    const LevelMeshes = [];
    const RootLock = new PositionLookup(1024);
    LevelMeshes.push({ Positions: SourcePositions, Normals: LevelNormals(SourcePositions, SourceIndices, SourceLookup, RemappedSourceNormals) });
    for (const Part of PartitionTriangles(SourcePositions, SourceIndices, ClusterSize)) {
        const Sphere = TightSphere(SourcePositions, Part);
        Clusters.push({
            Level: 0, Mesh: 0, Indices: Part,
            SelfError: 0, SelfSphere: Sphere,
            ParentError: RootParentError, ParentSphere: Sphere,
            GroupIndex: NoGroup, GeneratingGroup: NoGroup,
            CullSphere: Sphere, Cone: NormalCone(SourcePositions, Part),
        });
    }
    Phase("Partition");
    Log.push(`Level 0: ${Clusters.length} clusters (≤ ${ClusterSize} triangles)`);

    let Active = Clusters.map((_, Index) => Index);
    let Level = 0;
    let FailedGroups = 0;
    while (Active.length > 1 && Level < MaxLevels) {
        const Mesh = LevelMeshes[Clusters[Active[0]].Mesh];
        const MeshVertexCount = Mesh.Positions.length / 3;
        ReportProgress(`Grouping level ${Level}`, 0.05 + 0.6 * (1 - Active.length / Math.max(1, Clusters.length)));

        // Cluster connectivity through shared edges, weighted by shared edge count.
        const EdgeOwner = new Map();
        const PairWeight = new Map();
        for (let Local = 0; Local < Active.length; Local++) {
            const Indices = Clusters[Active[Local]].Indices;
            for (let Index = 0; Index < Indices.length; Index += 3) {
                for (let Corner = 0; Corner < 3; Corner++) {
                    const A = Indices[Index + Corner], B = Indices[Index + ((Corner + 1) % 3)];
                    const Key = A < B ? A * MeshVertexCount + B : B * MeshVertexCount + A;
                    const Held = EdgeOwner.get(Key);
                    if (Held === undefined) EdgeOwner.set(Key, Local);
                    else if (Held !== Local) {
                        const PairKey = Held < Local ? Held * Active.length + Local : Local * Active.length + Held;
                        PairWeight.set(PairKey, (PairWeight.get(PairKey) || 0) + 1);
                    }
                }
            }
        }
        const Degree = new Uint32Array(Active.length);
        for (const PairKey of PairWeight.keys()) {
            const A = Math.floor(PairKey / Active.length), B = PairKey - A * Active.length;
            Degree[A]++; Degree[B]++;
        }
        const Offsets = new Uint32Array(Active.length + 1);
        for (let Local = 0; Local < Active.length; Local++) Offsets[Local + 1] = Offsets[Local] + Degree[Local];
        const Fill = Offsets.slice(0, Active.length);
        const Targets = new Uint32Array(Offsets[Active.length]);
        const Weights = new Float32Array(Offsets[Active.length]);
        for (const [PairKey, Weight] of PairWeight) {
            const A = Math.floor(PairKey / Active.length), B = PairKey - A * Active.length;
            Targets[Fill[A]] = B; Weights[Fill[A]++] = Weight;
            Targets[Fill[B]] = A; Weights[Fill[B]++] = Weight;
        }
        const Centroids = new Float64Array(Active.length * 3);
        for (let Local = 0; Local < Active.length; Local++) {
            const Sphere = Clusters[Active[Local]].CullSphere;
            Centroids[Local * 3] = Sphere[0]; Centroids[Local * 3 + 1] = Sphere[1]; Centroids[Local * 3 + 2] = Sphere[2];
        }
        const { PartOfVertex: GroupOfLocal, PartCount: GroupCount } = PartitionWeightedGraph({
            VertexCount: Active.length, Offsets, Targets, Weights, Centroids, MaxPartSize: GroupSize, SweepWeight: 0.5,
        });
        Phase("Grouping");

        // Seam vertices: referenced by more than one group, or by an earlier root cluster.
        const FirstGroup = new Int32Array(MeshVertexCount).fill(-1);
        const Locked = new Uint8Array(MeshVertexCount);
        for (let Local = 0; Local < Active.length; Local++) {
            const Group = GroupOfLocal[Local];
            const Indices = Clusters[Active[Local]].Indices;
            for (let Index = 0; Index < Indices.length; Index++) {
                const V = Indices[Index];
                if (FirstGroup[V] < 0) FirstGroup[V] = Group;
                else if (FirstGroup[V] !== Group) Locked[V] = 1;
            }
        }
        if (RootLock.Count > 0) {
            for (let V = 0; V < MeshVertexCount; V++) {
                if (!Locked[V] && FirstGroup[V] >= 0 && RootLock.Find(Mesh.Positions[V * 3], Mesh.Positions[V * 3 + 1], Mesh.Positions[V * 3 + 2]) >= 0) Locked[V] = 1;
            }
        }

        const Members = Array.from({ length: GroupCount }, () => []);
        for (let Local = 0; Local < Active.length; Local++) Members[GroupOfLocal[Local]].push(Active[Local]);

        const LocalOfGlobal = new Int32Array(MeshVertexCount).fill(-1);
        const Outputs = [];
        let LevelGroupsBuilt = 0;
        for (let Group = 0; Group < GroupCount; Group++) {
            const ClusterIds = Members[Group];
            let TriangleCount = 0;
            for (const Id of ClusterIds) TriangleCount += Clusters[Id].Indices.length / 3;
            const Used = [];
            const LocalIndices = new Uint32Array(TriangleCount * 3);
            let Cursor = 0;
            for (const Id of ClusterIds) {
                const Indices = Clusters[Id].Indices;
                for (let Index = 0; Index < Indices.length; Index++) {
                    const V = Indices[Index];
                    if (LocalOfGlobal[V] < 0) { LocalOfGlobal[V] = Used.length; Used.push(V); }
                    LocalIndices[Cursor++] = LocalOfGlobal[V];
                }
            }
            const LocalPositions = new Float32Array(Used.length * 3);
            const LocalLocked = new Uint8Array(Used.length);
            for (let Local = 0; Local < Used.length; Local++) {
                const V = Used[Local];
                LocalPositions[Local * 3] = Mesh.Positions[V * 3];
                LocalPositions[Local * 3 + 1] = Mesh.Positions[V * 3 + 1];
                LocalPositions[Local * 3 + 2] = Mesh.Positions[V * 3 + 2];
                LocalLocked[Local] = Locked[V];
                LocalOfGlobal[V] = -1;
            }
            const Target = Math.max(1, Math.floor(TriangleCount * SimplifyRatio));
            const Result = SimplifyTriangles(LocalPositions, LocalIndices, { TargetTriangleCount: Target, LockedVertices: LocalLocked });
            if (Result.TriangleCount > TriangleCount * (1 - MinReduction) || Result.TriangleCount === 0) {
                // Could not simplify enough: these clusters become roots; lock their vertices forever.
                FailedGroups++;
                for (const Id of ClusterIds) {
                    const Indices = Clusters[Id].Indices;
                    for (let Index = 0; Index < Indices.length; Index++) {
                        const V = Indices[Index] * 3;
                        RootLock.Insert(Mesh.Positions[V], Mesh.Positions[V + 1], Mesh.Positions[V + 2]);
                    }
                }
                continue;
            }
            let GroupError = Result.Error;
            const ChildSpheres = new Float64Array(ClusterIds.length * 4);
            ClusterIds.forEach((Id, Slot) => {
                GroupError = Math.max(GroupError, Clusters[Id].SelfError);
                ChildSpheres.set(Clusters[Id].SelfSphere, Slot * 4);
            });
            const GroupSphere = Array.from(EncloseSpheres(ChildSpheres, 4, 0, ClusterIds.length));
            const GroupIndex = Groups.length;
            Groups.push({ Level, ClusterIds, Error: GroupError, Sphere: GroupSphere, InputTriangles: TriangleCount, OutputTriangles: Result.TriangleCount });
            for (const Id of ClusterIds) {
                Clusters[Id].ParentError = GroupError;
                Clusters[Id].ParentSphere = GroupSphere;
                Clusters[Id].GroupIndex = GroupIndex;
            }
            for (const Part of PartitionTriangles(Result.Positions, Result.Indices, ClusterSize)) {
                Outputs.push({ GroupIndex, Positions: Result.Positions, Part, Error: GroupError, Sphere: GroupSphere });
            }
            LevelGroupsBuilt++;
        }
        Phase("Simplify");
        if (LevelGroupsBuilt === 0) break;

        // Weld group outputs into the next level's shared vertex space (seams match bit-exactly).
        const Weld = new PositionLookup(Outputs.reduce((Sum, Output) => Sum + Output.Part.length, 0));
        const NextIndicesAll = [];
        const NextParts = [];
        for (const Output of Outputs) {
            const Part = new Uint32Array(Output.Part.length);
            for (let Index = 0; Index < Part.length; Index++) {
                const V = Output.Part[Index] * 3;
                Part[Index] = Weld.Insert(Output.Positions[V], Output.Positions[V + 1], Output.Positions[V + 2]);
            }
            NextParts.push(Part);
            NextIndicesAll.push(Part);
        }
        const NextPositions = Weld.Positions.slice(0, Weld.Count * 3);
        const Concatenated = new Uint32Array(NextIndicesAll.reduce((Sum, Part) => Sum + Part.length, 0));
        let Offset = 0;
        for (const Part of NextIndicesAll) { Concatenated.set(Part, Offset); Offset += Part.length; }
        const MeshIndex = LevelMeshes.length;
        LevelMeshes.push({ Positions: NextPositions, Normals: LevelNormals(NextPositions, Concatenated, SourceLookup, RemappedSourceNormals) });

        Level++;
        const NextActive = [];
        Outputs.forEach((Output, Slot) => {
            const Part = NextParts[Slot];
            const Cull = TightSphere(NextPositions, Part);
            NextActive.push(Clusters.length);
            Clusters.push({
                Level, Mesh: MeshIndex, Indices: Part,
                SelfError: Output.Error, SelfSphere: Output.Sphere,
                ParentError: RootParentError, ParentSphere: Output.Sphere,
                GroupIndex: NoGroup, GeneratingGroup: Output.GroupIndex,
                CullSphere: Cull, Cone: NormalCone(NextPositions, Part),
            });
        });
        const LevelTriangles = NextParts.reduce((Sum, Part) => Sum + Part.length / 3, 0);
        Log.push(`Level ${Level}: ${NextActive.length} clusters, ${LevelTriangles.toLocaleString()} triangles from ${LevelGroupsBuilt} groups`);
        Active = NextActive;
        Phase("Weld");
    }
    if (FailedGroups) Log.push(`${FailedGroups} groups could not reduce ≥ ${Math.round(MinReduction * 100)}% and were kept as roots`);

    // ── Discrete LOD chain (whole-network simplification) ─────────────────────
    const DiscreteLevels = [];
    if (BuildDiscreteChain) {
        let Positions = SourcePositions, Indices = SourceIndices, Error = 0;
        DiscreteLevels.push({ Positions, Indices, Error, Normals: LevelMeshes[0].Normals });
        while (DiscreteLevels.length < 10 && Indices.length / 3 > 256) {
            ReportProgress(`Discrete LOD ${DiscreteLevels.length}`, 0.7 + DiscreteLevels.length * 0.025);
            const TriangleCount = Indices.length / 3;
            const Result = SimplifyTriangles(Positions, Indices, { TargetTriangleCount: Math.floor(TriangleCount * 0.5) });
            if (Result.TriangleCount > TriangleCount * 0.9 || Result.TriangleCount === 0) break;
            Error = Math.max(Error, Result.Error);
            Positions = Result.Positions; Indices = Result.Indices;
            DiscreteLevels.push({ Positions, Indices, Error, Normals: LevelNormals(Positions, Indices, SourceLookup, RemappedSourceNormals) });
        }
        Log.push(`Discrete chain: ${DiscreteLevels.length} levels (${DiscreteLevels.map((Entry) => (Entry.Indices.length / 3).toLocaleString()).join(" → ")})`);
    }
    Phase("Discrete");
    ReportProgress("Packing", 0.95);

    // ── Packing ────────────────────────────────────────────────────────────────
    const Order = Clusters.map((_, Index) => Index);
    Order.sort((A, B) => Clusters[A].Level - Clusters[B].Level || A - B);
    const PackedOfBuild = new Uint32Array(Clusters.length);
    Order.forEach((BuildIndex, Packed) => { PackedOfBuild[BuildIndex] = Packed; });

    let TotalVertices = 0;
    for (const Cluster of Clusters) TotalVertices += Cluster.Indices.length;
    const VertexWords = new Uint32Array(TotalVertices * VertexWordStride);
    const VertexFloats = new Float32Array(VertexWords.buffer);
    const ClusterFloats = new Float32Array(Clusters.length * ClusterFloatStride);
    const ClusterIntegers = new Uint32Array(Clusters.length * ClusterIntegerStride);
    const LevelSummary = [];
    let VertexCursor = 0;
    let MaxTrianglesPerCluster = 0;
    for (let Packed = 0; Packed < Order.length; Packed++) {
        const Cluster = Clusters[Order[Packed]];
        const Mesh = LevelMeshes[Cluster.Mesh];
        const TriangleCount = Cluster.Indices.length / 3;
        MaxTrianglesPerCluster = Math.max(MaxTrianglesPerCluster, TriangleCount);
        const F = Packed * ClusterFloatStride;
        ClusterFloats.set(Cluster.CullSphere, F);
        ClusterFloats.set(Cluster.SelfSphere, F + 4);
        ClusterFloats.set(Cluster.ParentSphere, F + 8);
        ClusterFloats[F + 12] = Cluster.SelfError;
        ClusterFloats[F + 13] = Math.min(Cluster.ParentError, RootParentError);
        ClusterFloats.set(Cluster.Cone, F + 14);
        ClusterFloats[F + 18] = TriangleCount;
        ClusterFloats[F + 19] = Cluster.Level;
        const I = Packed * ClusterIntegerStride;
        ClusterIntegers[I] = VertexCursor;
        ClusterIntegers[I + 1] = TriangleCount;
        ClusterIntegers[I + 2] = Cluster.Level;
        ClusterIntegers[I + 3] = Cluster.GroupIndex;
        for (let Corner = 0; Corner < Cluster.Indices.length; Corner++) {
            const V = Cluster.Indices[Corner];
            const W = VertexCursor * VertexWordStride;
            VertexFloats[W] = Mesh.Positions[V * 3];
            VertexFloats[W + 1] = Mesh.Positions[V * 3 + 1];
            VertexFloats[W + 2] = Mesh.Positions[V * 3 + 2];
            VertexWords[W + 3] = OctEncodeNormal(Mesh.Normals[V * 3], Mesh.Normals[V * 3 + 1], Mesh.Normals[V * 3 + 2]);
            VertexWords[W + 4] = Packed;
            VertexWords[W + 5] = ((Corner / 3) | 0) | ((Corner % 3) << 8) | (Cluster.Level << 10);
            VertexCursor++;
        }
        const Summary = LevelSummary[Cluster.Level] || (LevelSummary[Cluster.Level] = {
            Level: Cluster.Level, ClusterCount: 0, TriangleCount: 0, MinError: Infinity, MaxError: 0, FirstCluster: Packed, GroupCount: 0, RootCount: 0,
        });
        Summary.ClusterCount++;
        Summary.TriangleCount += TriangleCount;
        Summary.MinError = Math.min(Summary.MinError, Cluster.SelfError);
        Summary.MaxError = Math.max(Summary.MaxError, Cluster.SelfError);
        if (Cluster.ParentError >= RootParentError) Summary.RootCount++;
    }
    for (const Group of Groups) if (LevelSummary[Group.Level]) LevelSummary[Group.Level].GroupCount++;

    // Discrete chain: same vertex layout, flag bit 16; word 4 holds the triangle index.
    let DiscreteVertexTotal = 0;
    for (const Entry of DiscreteLevels) DiscreteVertexTotal += Entry.Indices.length;
    const DiscreteWords = new Uint32Array(DiscreteVertexTotal * VertexWordStride);
    const DiscreteFloats = new Float32Array(DiscreteWords.buffer);
    const DiscreteTable = [];
    let DiscreteCursor = 0;
    DiscreteLevels.forEach((Entry, LevelIndex) => {
        DiscreteTable.push({ Level: LevelIndex, FirstVertex: DiscreteCursor, VertexCount: Entry.Indices.length, TriangleCount: Entry.Indices.length / 3, Error: Entry.Error });
        for (let Corner = 0; Corner < Entry.Indices.length; Corner++) {
            const V = Entry.Indices[Corner];
            const W = DiscreteCursor * VertexWordStride;
            DiscreteFloats[W] = Entry.Positions[V * 3];
            DiscreteFloats[W + 1] = Entry.Positions[V * 3 + 1];
            DiscreteFloats[W + 2] = Entry.Positions[V * 3 + 2];
            DiscreteWords[W + 3] = OctEncodeNormal(Entry.Normals[V * 3], Entry.Normals[V * 3 + 1], Entry.Normals[V * 3 + 2]);
            DiscreteWords[W + 4] = (Corner / 3) | 0;
            DiscreteWords[W + 5] = (((Corner / 3) | 0) & 255) | ((Corner % 3) << 8) | (LevelIndex << 10) | (1 << 16);
            DiscreteCursor++;
        }
    });

    const Bounding = BuildBoundingTree(ClusterFloats, LevelSummary);
    Phase("Packing");

    // Asset bounding sphere (from the root level cull spheres of level 0).
    const AssetSphere = Array.from(EncloseSpheres(ClusterFloats, ClusterFloatStride, 0, LevelSummary[0].ClusterCount));
    const GroupsPerLevel = LevelSummary.map((Summary) => Summary.GroupCount);
    Log.push(`Hierarchy: ${Clusters.length} clusters, ${Groups.length} groups, ${LevelSummary.length} levels, ${(TotalVertices / 3).toLocaleString()} total triangles (${(TotalVertices / 3 / SourceTriangleCount).toFixed(2)}× source)`);
    Log.push(`Bounding tree: ${Bounding.NodeCount} nodes over ${LevelSummary.length} level subtrees`);
    ReportProgress("Ready", 1);

    return {
        Label: Source.Label,
        SourceTriangleCount,
        ClusterSize, GroupSize,
        ClusterCount: Clusters.length,
        GroupCount: Groups.length,
        GroupsPerLevel,
        MaxTrianglesPerCluster,
        LevelSummary,
        VertexWords,
        ClusterFloats,
        ClusterIntegers,
        DiscreteWords,
        DiscreteTable,
        BoundingNodeFloats: Bounding.NodeFloats,
        BoundingNodeIntegers: Bounding.NodeIntegers,
        BoundingLeafClusters: Bounding.LeafClusters,
        BoundingNodeCount: Bounding.NodeCount,
        AssetSphere,
        FailedGroups,
        Timings,
        Log,
    };
}

// Per-level binary bounding tree (median split on cull-sphere centers, ≤ 8 clusters per leaf)
// joined under one root. Node floats: cull sphere(4), parent-LOD sphere(4), self-LOD sphere(4),
// max parent error, min self error. Node integers: first nested node / first leaf slot, count, leaf, level.
function BuildBoundingTree(ClusterFloats, LevelSummary) {
    const LeafSize = 8;
    const Nodes = [];
    const LeafClusters = [];
    const Queue = [];
    const Root = { Clusters: null, Level: -1 };
    Nodes.push(Root);
    Root.FirstNested = Nodes.length;
    Root.NestedCount = LevelSummary.length;
    for (const Summary of LevelSummary) {
        const List = [];
        for (let Cluster = Summary.FirstCluster; Cluster < Summary.FirstCluster + Summary.ClusterCount; Cluster++) List.push(Cluster);
        const Node = { Clusters: List, Level: Summary.Level };
        Nodes.push(Node);
        Queue.push(Node);
    }
    while (Queue.length) {
        const Node = Queue.shift();
        const List = Node.Clusters;
        if (List.length <= LeafSize) {
            Node.Leaf = true;
            Node.FirstLeaf = LeafClusters.length;
            for (const Cluster of List) LeafClusters.push(Cluster);
            continue;
        }
        let MinX = Infinity, MinY = Infinity, MinZ = Infinity, MaxX = -Infinity, MaxY = -Infinity, MaxZ = -Infinity;
        for (const Cluster of List) {
            const F = Cluster * ClusterFloatStride;
            MinX = Math.min(MinX, ClusterFloats[F]); MaxX = Math.max(MaxX, ClusterFloats[F]);
            MinY = Math.min(MinY, ClusterFloats[F + 1]); MaxY = Math.max(MaxY, ClusterFloats[F + 1]);
            MinZ = Math.min(MinZ, ClusterFloats[F + 2]); MaxZ = Math.max(MaxZ, ClusterFloats[F + 2]);
        }
        const Axis = MaxX - MinX >= MaxY - MinY && MaxX - MinX >= MaxZ - MinZ ? 0 : MaxY - MinY >= MaxZ - MinZ ? 1 : 2;
        List.sort((A, B) => ClusterFloats[A * ClusterFloatStride + Axis] - ClusterFloats[B * ClusterFloatStride + Axis]);
        const Half = List.length >> 1;
        const NestedA = { Clusters: List.slice(0, Half), Level: Node.Level };
        const NestedB = { Clusters: List.slice(Half), Level: Node.Level };
        Node.FirstNested = Nodes.length;
        Node.NestedCount = 2;
        Nodes.push(NestedA, NestedB);
        Queue.push(NestedA, NestedB);
    }
    // Bounds bottom-up (nested nodes always have higher indices).
    const NodeCount = Nodes.length;
    const NodeFloats = new Float32Array(NodeCount * BoundingNodeFloatStride);
    const NodeIntegers = new Int32Array(NodeCount * BoundingNodeIntegerStride);
    const Scratch = new Float64Array(4);
    for (let Index = NodeCount - 1; Index >= 0; Index--) {
        const Node = Nodes[Index];
        const F = Index * BoundingNodeFloatStride;
        const Spheres = [[], [], []];
        let MaxParentError = 0, MinSelfError = Infinity;
        if (Node.Leaf) {
            for (const Cluster of Node.Clusters) {
                const C = Cluster * ClusterFloatStride;
                Spheres[0].push(ClusterFloats[C], ClusterFloats[C + 1], ClusterFloats[C + 2], ClusterFloats[C + 3]);
                Spheres[1].push(ClusterFloats[C + 8], ClusterFloats[C + 9], ClusterFloats[C + 10], ClusterFloats[C + 11]);
                Spheres[2].push(ClusterFloats[C + 4], ClusterFloats[C + 5], ClusterFloats[C + 6], ClusterFloats[C + 7]);
                MaxParentError = Math.max(MaxParentError, ClusterFloats[C + 13]);
                MinSelfError = Math.min(MinSelfError, ClusterFloats[C + 12]);
            }
        } else {
            for (let Nested = Node.FirstNested; Nested < Node.FirstNested + Node.NestedCount; Nested++) {
                const N = Nested * BoundingNodeFloatStride;
                for (let Slot = 0; Slot < 3; Slot++) Spheres[Slot].push(NodeFloats[N + Slot * 4], NodeFloats[N + Slot * 4 + 1], NodeFloats[N + Slot * 4 + 2], NodeFloats[N + Slot * 4 + 3]);
                MaxParentError = Math.max(MaxParentError, NodeFloats[N + 12]);
                MinSelfError = Math.min(MinSelfError, NodeFloats[N + 13]);
            }
        }
        for (let Slot = 0; Slot < 3; Slot++) {
            EncloseSpheres(Spheres[Slot], 4, 0, Spheres[Slot].length / 4, Scratch);
            NodeFloats.set(Scratch, F + Slot * 4);
        }
        NodeFloats[F + 12] = MaxParentError;
        NodeFloats[F + 13] = MinSelfError === Infinity ? 0 : MinSelfError;
        const I = Index * BoundingNodeIntegerStride;
        if (Node.Leaf) {
            NodeIntegers[I] = Node.FirstLeaf;
            NodeIntegers[I + 1] = Node.Clusters.length;
            NodeIntegers[I + 2] = 1;
        } else {
            NodeIntegers[I] = Node.FirstNested;
            NodeIntegers[I + 1] = Node.NestedCount;
            NodeIntegers[I + 2] = 0;
        }
        NodeIntegers[I + 3] = Node.Level;
    }
    return { NodeFloats, NodeIntegers, LeafClusters: Uint32Array.from(LeafClusters), NodeCount };
}

// Transferable buffers for postMessage.
export function EnumerateTransferBuffers(Asset) {
    return [Asset.VertexWords, Asset.ClusterFloats, Asset.ClusterIntegers, Asset.DiscreteWords, Asset.BoundingNodeFloats, Asset.BoundingNodeIntegers, Asset.BoundingLeafClusters].map((Array) => Array.buffer);
}
