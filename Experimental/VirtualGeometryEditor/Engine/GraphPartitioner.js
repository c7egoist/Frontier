// Balanced recursive bisection of a weighted graph stored as CSR arrays.
// Each bisection grows region A from a pseudo-peripheral seed (minimum projection on the
// longest centroid axis) by greedy graph growing: the frontier vertex with the strongest
// connection to A wins, ties broken by sweep position. Disconnected leftovers re-seed at
// the next minimum-projection vertex, so islands stay spatially coherent.
// Used for triangle → cluster partitioning and cluster → group partitioning.

class KeyedMinHeap {
    constructor(Capacity = 256) {
        this.Keys = new Float64Array(Capacity);
        this.Vertices = new Int32Array(Capacity);
        this.Count = 0;
    }
    Clear() { this.Count = 0; }
    Push(Key, Vertex) {
        if (this.Count === this.Keys.length) {
            const Keys = new Float64Array(this.Keys.length * 2); Keys.set(this.Keys); this.Keys = Keys;
            const Vertices = new Int32Array(this.Vertices.length * 2); Vertices.set(this.Vertices); this.Vertices = Vertices;
        }
        let Index = this.Count++;
        while (Index > 0) {
            const Up = (Index - 1) >> 1;
            if (this.Keys[Up] <= Key) break;
            this.Keys[Index] = this.Keys[Up]; this.Vertices[Index] = this.Vertices[Up];
            Index = Up;
        }
        this.Keys[Index] = Key; this.Vertices[Index] = Vertex;
    }
    Pop() {
        const Top = this.Vertices[0];
        const LastKey = this.Keys[--this.Count], LastVertex = this.Vertices[this.Count];
        let Index = 0;
        for (;;) {
            let Child = Index * 2 + 1;
            if (Child >= this.Count) break;
            if (Child + 1 < this.Count && this.Keys[Child + 1] < this.Keys[Child]) Child++;
            if (this.Keys[Child] >= LastKey) break;
            this.Keys[Index] = this.Keys[Child]; this.Vertices[Index] = this.Vertices[Child];
            Index = Child;
        }
        this.Keys[Index] = LastKey; this.Vertices[Index] = LastVertex;
        return Top;
    }
}

export function PartitionWeightedGraph({ VertexCount, Offsets, Targets, Weights = null, Centroids, MaxPartSize, SweepWeight = 1.0 }) {
    const PartOfVertex = new Int32Array(VertexCount).fill(-1);
    let PartCount = 0;
    if (VertexCount === 0) return { PartOfVertex, PartCount };
    const SetStamp = new Int32Array(VertexCount);
    const RegionStamp = new Int32Array(VertexCount);
    const Gain = new Float64Array(VertexCount);
    const Projection = new Float64Array(VertexCount);
    const Heap = new KeyedMinHeap(1024);
    let Epoch = 0;

    const Initial = new Int32Array(VertexCount);
    for (let Vertex = 0; Vertex < VertexCount; Vertex++) Initial[Vertex] = Vertex;
    const Pending = [Initial];

    while (Pending.length) {
        const List = Pending.pop();
        const Count = List.length;
        if (Count <= MaxPartSize) {
            for (let Index = 0; Index < Count; Index++) PartOfVertex[List[Index]] = PartCount;
            PartCount++;
            continue;
        }
        const PartsNeeded = Math.ceil(Count / MaxPartSize);
        const LeftParts = Math.floor(PartsNeeded / 2);
        const TargetA = Math.max(1, Math.min(Count - 1, Math.round((Count * LeftParts) / PartsNeeded)));

        Epoch++;
        const SetEpoch = Epoch;
        let MinX = Infinity, MinY = Infinity, MinZ = Infinity, MaxX = -Infinity, MaxY = -Infinity, MaxZ = -Infinity;
        for (let Index = 0; Index < Count; Index++) {
            const Vertex = List[Index];
            SetStamp[Vertex] = SetEpoch;
            Gain[Vertex] = 0;
            const X = Centroids[Vertex * 3], Y = Centroids[Vertex * 3 + 1], Z = Centroids[Vertex * 3 + 2];
            if (X < MinX) MinX = X; if (X > MaxX) MaxX = X;
            if (Y < MinY) MinY = Y; if (Y > MaxY) MaxY = Y;
            if (Z < MinZ) MinZ = Z; if (Z > MaxZ) MaxZ = Z;
        }
        const Ex = MaxX - MinX, Ey = MaxY - MinY, Ez = MaxZ - MinZ;
        const Axis = Ex >= Ey && Ex >= Ez ? 0 : Ey >= Ez ? 1 : 2;
        const AxisMin = Axis === 0 ? MinX : Axis === 1 ? MinY : MinZ;
        const AxisExtent = Math.max(Axis === 0 ? Ex : Axis === 1 ? Ey : Ez, 1e-12);
        for (let Index = 0; Index < Count; Index++) {
            const Vertex = List[Index];
            Projection[Vertex] = (Centroids[Vertex * 3 + Axis] - AxisMin) / AxisExtent;
        }

        // Region A grows; region membership marked with RegionStamp = SetEpoch.
        Heap.Clear();
        let CountA = 0;
        let ScanCursor = 0;
        // Pre-sort scan order by projection so re-seeding is amortized O(n log n).
        const ScanOrder = Array.from(List).sort((A, B) => Projection[A] - Projection[B]);
        while (CountA < TargetA) {
            if (Heap.Count === 0) {
                while (ScanCursor < Count && RegionStamp[ScanOrder[ScanCursor]] === SetEpoch) ScanCursor++;
                if (ScanCursor >= Count) break;
                const Seed = ScanOrder[ScanCursor];
                Heap.Push(SweepWeight * Projection[Seed], Seed);
            }
            const Vertex = Heap.Pop();
            if (RegionStamp[Vertex] === SetEpoch) continue;
            RegionStamp[Vertex] = SetEpoch;
            CountA++;
            for (let Edge = Offsets[Vertex]; Edge < Offsets[Vertex + 1]; Edge++) {
                const Other = Targets[Edge];
                if (SetStamp[Other] !== SetEpoch || RegionStamp[Other] === SetEpoch) continue;
                Gain[Other] += Weights ? Weights[Edge] : 1;
                Heap.Push(-Gain[Other] + SweepWeight * Projection[Other], Other);
            }
        }

        const ListA = new Int32Array(CountA);
        const ListB = new Int32Array(Count - CountA);
        let CursorA = 0, CursorB = 0;
        for (let Index = 0; Index < Count; Index++) {
            const Vertex = List[Index];
            if (RegionStamp[Vertex] === SetEpoch) ListA[CursorA++] = Vertex;
            else ListB[CursorB++] = Vertex;
        }
        if (ListA.length === 0 || ListB.length === 0) {
            // Degenerate (should not happen): fall back to a median split on the sweep axis.
            const Sorted = ScanOrder;
            Pending.push(Int32Array.from(Sorted.slice(0, TargetA)), Int32Array.from(Sorted.slice(TargetA)));
            continue;
        }
        Pending.push(ListB, ListA);
    }
    return { PartOfVertex, PartCount };
}

// Triangle connectivity graph through shared edges (CSR). Positions are only used for centroids.
export function ConstructTriangleGraph(Positions, Indices, TriangleList = null) {
    const TriangleCount = TriangleList ? TriangleList.length : Indices.length / 3;
    const TriangleAt = (Local) => (TriangleList ? TriangleList[Local] : Local);
    const EdgeOwner = new Map();
    const Pairs = [];
    let VertexSpan = 0;
    for (let Local = 0; Local < TriangleCount; Local++) {
        const T = TriangleAt(Local) * 3;
        VertexSpan = Math.max(VertexSpan, Indices[T], Indices[T + 1], Indices[T + 2]);
    }
    VertexSpan += 1;
    for (let Local = 0; Local < TriangleCount; Local++) {
        const T = TriangleAt(Local) * 3;
        for (let Corner = 0; Corner < 3; Corner++) {
            const A = Indices[T + Corner], B = Indices[T + ((Corner + 1) % 3)];
            const Key = A < B ? A * VertexSpan + B : B * VertexSpan + A;
            const Held = EdgeOwner.get(Key);
            if (Held === undefined) EdgeOwner.set(Key, Local);
            else if (Held >= 0) { Pairs.push(Held, Local); EdgeOwner.set(Key, -1 - Held); }
            else Pairs.push(-1 - Held, Local); // non-manifold: connect to first owner as well
        }
    }
    const Degree = new Uint32Array(TriangleCount + 1);
    for (let Index = 0; Index < Pairs.length; Index += 2) { Degree[Pairs[Index]]++; Degree[Pairs[Index + 1]]++; }
    const Offsets = new Uint32Array(TriangleCount + 1);
    for (let Local = 0; Local < TriangleCount; Local++) Offsets[Local + 1] = Offsets[Local] + Degree[Local];
    const Fill = Offsets.slice(0, TriangleCount);
    const Targets = new Uint32Array(Offsets[TriangleCount]);
    for (let Index = 0; Index < Pairs.length; Index += 2) {
        const A = Pairs[Index], B = Pairs[Index + 1];
        Targets[Fill[A]++] = B; Targets[Fill[B]++] = A;
    }
    const Centroids = new Float64Array(TriangleCount * 3);
    for (let Local = 0; Local < TriangleCount; Local++) {
        const T = TriangleAt(Local) * 3;
        for (let Axis = 0; Axis < 3; Axis++) {
            Centroids[Local * 3 + Axis] = (Positions[Indices[T] * 3 + Axis] + Positions[Indices[T + 1] * 3 + Axis] + Positions[Indices[T + 2] * 3 + Axis]) / 3;
        }
    }
    return { VertexCount: TriangleCount, Offsets, Targets, Weights: null, Centroids };
}
