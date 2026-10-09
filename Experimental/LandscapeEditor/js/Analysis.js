// 📦 Terrain analysis — gradients, protrusion curvature, coast distance, and priority-flood D8 drainage with flow accumulation.

const Diagonal = Math.SQRT2;
const Neighbours = [
    [-1, 0, 1], [1, 0, 1], [0, -1, 1], [0, 1, 1],
    [-1, -1, Diagonal], [1, -1, Diagonal], [-1, 1, Diagonal], [1, 1, Diagonal],
];

/// in    Heights   [m]    Float32Array N×N row-major
/// in    N         [-]    grid edge length in cells
/// in    Cell      [m]    cell edge length
/// out   Gradient  [m/m]  { Gx, Gy } central differences, one-sided at the border
export function Gradient(Heights, N, Cell) {
    const Gx = new Float32Array(N * N);
    const Gy = new Float32Array(N * N);
    for (let Y = 0; Y < N; Y++) {
        for (let X = 0; X < N; X++) {
            const Index = Y * N + X;
            const Left = X > 0 ? Heights[Index - 1] : Heights[Index];
            const Right = X < N - 1 ? Heights[Index + 1] : Heights[Index];
            const Up = Y > 0 ? Heights[Index - N] : Heights[Index];
            const Down = Y < N - 1 ? Heights[Index + N] : Heights[Index];
            const SpanX = (X > 0 && X < N - 1 ? 2 : 1) * Cell;
            const SpanY = (Y > 0 && Y < N - 1 ? 2 : 1) * Cell;
            Gx[Index] = (Right - Left) / SpanX;
            Gy[Index] = (Down - Up) / SpanY;
        }
    }
    return { Gx, Gy };
}

/// in    Heights     [m]    Float32Array N×N
/// in    N           [-]    grid edge length
/// in    Cell        [m]    cell edge length
/// out   Protrusion   [-]   curvature normalised to [-1, 1]; positive on convex crests, negative in concave hollows
export function Protrusion(Heights, N, Cell) {
    const Raw = new Float32Array(N * N);
    const Magnitudes = [];
    for (let Y = 0; Y < N; Y++) {
        for (let X = 0; X < N; X++) {
            const Index = Y * N + X;
            const Left = X > 0 ? Heights[Index - 1] : Heights[Index];
            const Right = X < N - 1 ? Heights[Index + 1] : Heights[Index];
            const Up = Y > 0 ? Heights[Index - N] : Heights[Index];
            const Down = Y < N - 1 ? Heights[Index + N] : Heights[Index];
            const Laplacian = (Left + Right + Up + Down - 4 * Heights[Index]) / (Cell * Cell);
            Raw[Index] = -Laplacian;
            if ((X + Y) % 3 === 0) {
                Magnitudes.push(Math.abs(Laplacian));
            }
        }
    }
    Magnitudes.sort((A, B) => A - B);
    const Scale = Magnitudes[Math.floor(Magnitudes.length * 0.95)] || 1e-9;
    for (let Index = 0; Index < Raw.length; Index++) {
        Raw[Index] = Math.max(-1, Math.min(1, Raw[Index] / Scale));
    }
    return Raw;
}

/// in    Mask       [-]  Uint8Array N×N; nonzero cells are targets
/// in    N          [-]  grid edge length
/// in    Cell       [m]  cell edge length
/// out   Distance   [m]  Float32Array; distance to the nearest target, zero on targets
export function DistanceTo(Mask, N, Cell) {
    const Distance = new Float32Array(N * N);
    for (let Index = 0; Index < N * N; Index++) {
        Distance[Index] = Mask[Index] ? 0 : 1e9;
    }
    for (let Y = 0; Y < N; Y++) {
        for (let X = 0; X < N; X++) {
            const Index = Y * N + X;
            let Best = Distance[Index];
            if (X > 0) Best = Math.min(Best, Distance[Index - 1] + 1);
            if (Y > 0) Best = Math.min(Best, Distance[Index - N] + 1);
            if (X > 0 && Y > 0) Best = Math.min(Best, Distance[Index - N - 1] + Diagonal);
            if (X < N - 1 && Y > 0) Best = Math.min(Best, Distance[Index - N + 1] + Diagonal);
            Distance[Index] = Best;
        }
    }
    for (let Y = N - 1; Y >= 0; Y--) {
        for (let X = N - 1; X >= 0; X--) {
            const Index = Y * N + X;
            let Best = Distance[Index];
            if (X < N - 1) Best = Math.min(Best, Distance[Index + 1] + 1);
            if (Y < N - 1) Best = Math.min(Best, Distance[Index + N] + 1);
            if (X < N - 1 && Y < N - 1) Best = Math.min(Best, Distance[Index + N + 1] + Diagonal);
            if (X > 0 && Y < N - 1) Best = Math.min(Best, Distance[Index + N - 1] + Diagonal);
            Distance[Index] = Best;
        }
    }
    for (let Index = 0; Index < Distance.length; Index++) {
        Distance[Index] *= Cell;
    }
    return Distance;
}

/// in    Heights    [m]   Float32Array N×N
/// in    N          [-]   grid edge length
/// in    Sea        [m]   sea level; cells at or below it are outlets
/// out   Routing    [-]   { Filled, Receiver, Order } — filled surface, D8 receiver index, and pop order (receivers before donors)
export function RouteDrainage(Heights, N, Sea) {
    const Total = N * N;
    const Filled = new Float32Array(Heights);
    const Receiver = new Int32Array(Total);
    const Visited = new Uint8Array(Total);
    const Order = new Int32Array(Total);
    const Heap = new HeapQueue(Total);
    const Epsilon = 1e-3;
    for (let Y = 0; Y < N; Y++) {
        for (let X = 0; X < N; X++) {
            const Index = Y * N + X;
            const IsEdge = X === 0 || Y === 0 || X === N - 1 || Y === N - 1;
            if (IsEdge || Heights[Index] <= Sea) {
                Visited[Index] = 1;
                Receiver[Index] = Index;
                Heap.Push(Heights[Index], Index);
            }
        }
    }
    let Count = 0;
    while (Heap.Size > 0) {
        const Current = Heap.Pop();
        Order[Count++] = Current;
        const CX = Current % N;
        const CY = (Current - CX) / N;
        for (const [DX, DY] of Neighbours) {
            const NX = CX + DX;
            const NY = CY + DY;
            if (NX < 0 || NY < 0 || NX >= N || NY >= N) {
                continue;
            }
            const Next = NY * N + NX;
            if (Visited[Next]) {
                continue;
            }
            Visited[Next] = 1;
            Receiver[Next] = Current;
            Filled[Next] = Math.max(Heights[Next], Filled[Current] + Epsilon);
            Heap.Push(Filled[Next], Next);
        }
    }
    return { Filled, Receiver, Order, Count };
}

/// in    Routing   [-]  { Receiver, Order, Count } from RouteDrainage
/// in    N         [-]  grid edge length
/// out   Area      [cells]  Float32Array of upstream contributing cell counts, including the cell itself
export function AccumulateFlow(Routing, N) {
    const Area = new Float32Array(N * N).fill(1);
    const { Receiver, Order, Count } = Routing;
    for (let Step = Count - 1; Step >= 0; Step--) {
        const Index = Order[Step];
        const Down = Receiver[Index];
        if (Down !== Index) {
            Area[Down] += Area[Index];
        }
    }
    return Area;
}

/// in    Heights    [m]   Float32Array N×N
/// in    Routing    [-]   from RouteDrainage
/// in    N          [-]   grid edge length
/// in    Cell       [m]   cell edge length
/// out   Slope      [deg] steepness per cell
export function ReceiverSlope(Heights, Routing, N, Cell) {
    const Result = new Float32Array(N * N);
    const { Receiver } = Routing;
    for (let Index = 0; Index < N * N; Index++) {
        const Down = Receiver[Index];
        if (Down === Index) {
            continue;
        }
        const DX = Math.abs((Down % N) - (Index % N));
        const DY = Math.abs(Math.floor(Down / N) - Math.floor(Index / N));
        const Distance = DX + DY === 2 ? Cell * Diagonal : Cell;
        const Drop = Math.max(Heights[Index] - Heights[Down], 0);
        Result[Index] = (Math.atan(Drop / Distance) * 180) / Math.PI;
    }
    return Result;
}

/// in    Heights    [m]   Float32Array N×N
/// in    N          [-]   grid edge length
/// in    Sea        [m]   sea level
/// in    Cell       [m]   cell edge length
/// out   Analysis   [-]   { Slope, Protrusion, Area, River, Moisture, Coast, Routing, Altitude, Gradient }
export function AnalyseTerrain(Heights, N, Cell, Sea) {
    const Total = N * N;
    const { Gx, Gy } = Gradient(Heights, N, Cell);
    const Slope = new Float32Array(Total);
    let Highest = 1e-6;
    for (let Index = 0; Index < Total; Index++) {
        Slope[Index] = (Math.atan(Math.hypot(Gx[Index], Gy[Index])) * 180) / Math.PI;
        Highest = Math.max(Highest, Heights[Index]);
    }
    const Curvature = Protrusion(Heights, N, Cell);
    const Routing = RouteDrainage(Heights, N, Sea);
    const Area = AccumulateFlow(Routing, N);
    let MaximumArea = 1;
    for (let Index = 0; Index < Total; Index++) {
        MaximumArea = Math.max(MaximumArea, Area[Index]);
    }
    const RiverThreshold = Math.max(24, Total * 0.003);
    const River = new Float32Array(Total);
    const Moisture = new Float32Array(Total);
    const Altitude = new Float32Array(Total);
    const SeaMask = new Uint8Array(Total);
    const LandMask = new Uint8Array(Total);
    for (let Index = 0; Index < Total; Index++) {
        const Flow = Area[Index];
        const Span = Math.log(MaximumArea) - Math.log(RiverThreshold);
        River[Index] = Flow > RiverThreshold && Span > 0 ? Math.min((Math.log(Flow) - Math.log(RiverThreshold)) / Span, 1) : 0;
        Altitude[Index] = Math.min(Math.max(Heights[Index] / Highest, 0), 1);
        const Soft = Math.min(Math.sqrt(Flow / MaximumArea) * 2.2, 1);
        const Concave = Math.max(-Curvature[Index], 0);
        Moisture[Index] = Math.min(Math.max(0.6 * Soft + 0.25 * (1 - Altitude[Index]) + 0.35 * Concave, 0), 1);
        SeaMask[Index] = Heights[Index] <= Sea ? 1 : 0;
        LandMask[Index] = SeaMask[Index] ? 0 : 1;
    }
    const DistanceToSea = DistanceTo(SeaMask, N, Cell);
    const DistanceToLand = DistanceTo(LandMask, N, Cell);
    const Coast = new Float32Array(Total);
    for (let Index = 0; Index < Total; Index++) {
        Coast[Index] = SeaMask[Index] ? -DistanceToLand[Index] : DistanceToSea[Index];
    }
    return {
        Slope,
        Protrusion: Curvature,
        Area,
        River,
        Moisture,
        Coast,
        Routing,
        Altitude,
        Gradient: { Gx, Gy },
        Highest,
        MaximumArea,
    };
}

/// 📝 Binary min-heap keyed by a float; the priority-flood needs O(N log N) pops over the whole grid.
class HeapQueue {
    constructor(Capacity) {
        this.Keys = new Float64Array(Capacity);
        this.Items = new Int32Array(Capacity);
        this.Size = 0;
    }

    /// in    Key    [m]  priority, lower pops first
    /// in    Item   [-]  cell index
    Push(Key, Item) {
        let Position = this.Size++;
        while (Position > 0) {
            const Parent = (Position - 1) >> 1;
            if (this.Keys[Parent] <= Key) {
                break;
            }
            this.Keys[Position] = this.Keys[Parent];
            this.Items[Position] = this.Items[Parent];
            Position = Parent;
        }
        this.Keys[Position] = Key;
        this.Items[Position] = Item;
    }

    /// out   Item   [-]  cell index with the lowest key
    Pop() {
        const Top = this.Items[0];
        const Last = --this.Size;
        const Key = this.Keys[Last];
        const Item = this.Items[Last];
        let Position = 0;
        while (true) {
            let Child = Position * 2 + 1;
            if (Child >= Last) {
                break;
            }
            if (Child + 1 < Last && this.Keys[Child + 1] < this.Keys[Child]) {
                Child++;
            }
            if (this.Keys[Child] >= Key) {
                break;
            }
            this.Keys[Position] = this.Keys[Child];
            this.Items[Position] = this.Items[Child];
            Position = Child;
        }
        this.Keys[Position] = Key;
        this.Items[Position] = Item;
        return Top;
    }
}
