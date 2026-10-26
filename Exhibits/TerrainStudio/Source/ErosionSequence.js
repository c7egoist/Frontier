//============================================================================================================================================
//                                                              EROSIONSEQUENCE.JS
//============================================================================================================================================
// 🧩 The geological solvers. Each sequence reads the relief (and some channels), moves real material
//    around, and writes the evidence back into channels: wear where rock was taken, deposition where it
//    came to rest, flow and standing water from the drainage solution.
//
// 📝 The fluvial sequence is the honest one: priority-flood depression filling (Barnes), steepest-descent
//    routing on the filled surface, drainage-area accumulation, then stream-power incision  E = K·A^m·S
//    with downstream sediment delivery. Droplet hydraulics carves the rills the routing cannot see;
//    thermal relaxation holds every slope at or below its angle of repose; glacial polish widens trunk
//    valleys into U profiles; the slab transport model moves sand downwind and drops it in wind shadow.

import { Resolution, TexelSize, ConstructRandomStream } from "./ReliefField.js";

const YieldInterval = 4096;   // completions between yields to the browser

async function YieldBriefly()
{
    await new Promise((Resolve) => setTimeout(Resolve, 0));
}

export class Cancellation
{
    constructor()
    {
        this.Requested = false;
    }
    ThrowIfRequested()
    {
        if (this.Requested)
            throw new Error("Cancelled");
    }
}

//--------------------------------------------------------------------------------------------------------------------------------------------
//                                                                  HYDRAULIC DROPLETS
//--------------------------------------------------------------------------------------------------------------------------------------------

// 📝 Particle erosion: each droplet is born with unit water, accelerates downhill carrying sediment up to
//    a capacity set by speed × water × slope, and surrenders it where the slope relents. Rock hardness
//    (from the strata sequence) throttles pickup, which is what steps a canyon wall.

export async function HydraulicErosion(Field, Params, Report, Cancel)
{
    const Heights    = Field.Heights;
    const Wear       = Field.ChannelSamples("Wear");
    const Deposition = Field.ChannelSamples("Deposition");
    const Hardness   = Field.ChannelSamples("Hardness");
    const N          = Resolution;

    const DropletCount     = Math.max(1000, Math.round(Params.Droplets));
    const Lifetime         = 34;
    const Inertia          = Params.Inertia;
    const CapacityFactor   = Params.Capacity;
    const MinimumCapacity  = 0.01;
    const ErodeRate        = Params.ErodeRate;
    const DepositRate      = Params.DepositRate;
    const EvaporateRate    = 0.01;
    const Gravity          = -4.0;
    const Radius           = Math.max(1, Math.round(Params.Radius));

    // Brush offsets with linear falloff, normalised once.
    const Offsets  = [];
    const Weights  = [];
    let WeightSum  = 0.0;
    for (let Oy = -Radius; Oy <= Radius; Oy++)
    {
        for (let Ox = -Radius; Ox <= Radius; Ox++)
        {
            const Distance = Math.sqrt(Ox * Ox + Oy * Oy);
            if (Distance <= Radius)
            {
                const Weight = 1.0 - Distance / Radius;
                Offsets.push([Ox, Oy]);
                Weights.push(Weight);
                WeightSum += Weight;
            }
        }
    }
    for (let Index = 0; Index < Weights.length; Index++)
        Weights[Index] /= WeightSum;

    const NextRandom = ConstructRandomStream(Params.Seed);
    const Inset = Radius + 2;
    const Span  = N - Inset * 2;

    for (let Droplet = 0; Droplet < DropletCount; Droplet++)
    {
        let PosX = Inset + NextRandom() * Span;
        let PosY = Inset + NextRandom() * Span;
        let DirX = 0.0;
        let DirY = 0.0;
        let Speed    = 1.0;
        let Water    = 1.0;
        let Sediment = 0.0;
        // Each droplet keeps a consistent turning bias for its whole life: rills curve, cross and
        // capture one another instead of running as parallel corduroy down smooth faces.
        const TurnRate = (NextRandom() - 0.5) * 0.85;

        for (let Step = 0; Step < Lifetime; Step++)
        {
            const CellX = Math.floor(PosX);
            const CellY = Math.floor(PosY);
            const FracX = PosX - CellX;
            const FracY = PosY - CellY;
            const Index = CellY * N + CellX;

            // Bilinear height and gradient at the droplet.
            const HAA = Heights[Index];
            const HBA = Heights[Index + 1];
            const HAB = Heights[Index + N];
            const HBB = Heights[Index + N + 1];
            const GradX = (HBA - HAA) * (1.0 - FracY) + (HBB - HAB) * FracY;
            const GradY = (HAB - HAA) * (1.0 - FracX) + (HBB - HBA) * FracX;
            const HeightHere = HAA * (1.0 - FracX) * (1.0 - FracY) + HBA * FracX * (1.0 - FracY)
                             + HAB * (1.0 - FracX) * FracY + HBB * FracX * FracY;

            DirX = DirX * Inertia - GradX * (1.0 - Inertia);
            DirY = DirY * Inertia - GradY * (1.0 - Inertia);
            const DirLength = Math.sqrt(DirX * DirX + DirY * DirY);
            if (DirLength < 1e-6)
                break;
            DirX /= DirLength;
            DirY /= DirLength;
            // Persistent curvature (this droplet's TurnRate) plus a whisper of jitter.
            const CurveAngle = TurnRate * (0.65 + NextRandom() * 0.35);
            const CurveCos = Math.cos(CurveAngle);
            const CurveSin = Math.sin(CurveAngle);
            const CurvedX = DirX * CurveCos - DirY * CurveSin;
            const CurvedY = DirX * CurveSin + DirY * CurveCos;
            DirX = CurvedX;
            DirY = CurvedY;
            PosX += DirX;
            PosY += DirY;
            if (PosX < Inset || PosX > N - Inset - 1 || PosY < Inset || PosY > N - Inset - 1)
                break;

            const NewCellX = Math.floor(PosX);
            const NewCellY = Math.floor(PosY);
            const NewFracX = PosX - NewCellX;
            const NewFracY = PosY - NewCellY;
            const NewIndex = NewCellY * N + NewCellX;
            const NAA = Heights[NewIndex];
            const NBA = Heights[NewIndex + 1];
            const NAB = Heights[NewIndex + N];
            const NBB = Heights[NewIndex + N + 1];
            const HeightNext = NAA * (1.0 - NewFracX) * (1.0 - NewFracY) + NBA * NewFracX * (1.0 - NewFracY)
                             + NAB * (1.0 - NewFracX) * NewFracY + NBB * NewFracX * NewFracY;
            const DeltaHeight = HeightNext - HeightHere;

            // Sediment capacity saturates with slope: real sheet flow is depth-limited, so a
            // near-vertical face does not grant a droplet unbounded carrying power. Without the
            // saturation (and the terminal speed below), droplets auger deep parallel grooves
            // down every steep wall — the wax-drip artefact.
            const Drop = -DeltaHeight;
            const EffectiveDrop = Drop > 0.0 ? Drop / (1.0 + Drop * 0.30) : Drop;
            const Capacity = Math.max(CapacityFactor * Speed * Water * EffectiveDrop, MinimumCapacity);

            if (Sediment > Capacity || DeltaHeight > 0.0)
            {
                // Deposit: uphill steps dump enough to fill, flats dump a fraction of the excess.
                let Amount = DeltaHeight > 0.0 ? Math.min(DeltaHeight, Sediment)
                                               : (Sediment - Capacity) * DepositRate;
                if (Amount > 0.0)
                {
                    Sediment -= Amount;
                    Heights[Index]         += Amount * (1.0 - FracX) * (1.0 - FracY);
                    Heights[Index + 1]     += Amount * FracX * (1.0 - FracY);
                    Heights[Index + N]     += Amount * (1.0 - FracX) * FracY;
                    Heights[Index + N + 1] += Amount * FracX * FracY;
                    Deposition[Index] += Amount * 6.0;
                }
            }
            else
            {
                let Amount = Math.min((Capacity - Sediment) * ErodeRate, EffectiveDrop > 0.0 ? EffectiveDrop : 0.0);
                if (Amount > 0.0)
                {
                    for (let BrushIndex = 0; BrushIndex < Offsets.length; BrushIndex++)
                    {
                        const TargetX = CellX + Offsets[BrushIndex][0];
                        const TargetY = CellY + Offsets[BrushIndex][1];
                        if (TargetX < 0 || TargetX >= N || TargetY < 0 || TargetY >= N)
                            continue;
                        const TargetIndex = TargetY * N + TargetX;
                        const Resistance  = 1.0 - 0.85 * Hardness[TargetIndex];
                        const Weighted    = Amount * Weights[BrushIndex] * Resistance;
                        const Taken       = Heights[TargetIndex] < Weighted ? Heights[TargetIndex] : Weighted;
                        Heights[TargetIndex] -= Taken;
                        Sediment += Taken;
                        Wear[TargetIndex] += Taken * 6.0;
                    }
                }
            }

            Speed = Math.sqrt(Math.max(Speed * Speed + DeltaHeight * Gravity, 0.0));
            if (Speed > 3.2) Speed = 3.2;   // terminal velocity: friction wins on long faces
            Water *= 1.0 - EvaporateRate;
            if (Water < 0.01)
                break;
        }

        if ((Droplet & 8191) === 0)
        {
            Report(Droplet / DropletCount);
            Cancel.ThrowIfRequested();
            await YieldBriefly();
        }
    }

    NormaliseEvidence(Wear);
    NormaliseEvidence(Deposition);
    Report(1.0);
}

function NormaliseEvidence(Samples)
{
    let Reference = 0.0;
    for (let Index = 0; Index < Samples.length; Index += 7)
    {
        if (Samples[Index] > Reference)
            Reference = Samples[Index];
    }
    if (Reference <= 0.0)
        return;
    const Scale = 1.0 / (Reference * 0.35);
    for (let Index = 0; Index < Samples.length; Index++)
    {
        const Scaled = Samples[Index] * Scale;
        Samples[Index] = Scaled / (1.0 + Scaled);   // soft shoulder keeps mid-tones readable
    }
}

//--------------------------------------------------------------------------------------------------------------------------------------------
//                                                                  THERMAL RELAXATION
//--------------------------------------------------------------------------------------------------------------------------------------------

// 📝 Slopes above the talus angle shed material to their lowest neighbour until they rest. Delta
//    accumulation keeps the iteration stable and exactly mass-conserving in the interior.

export async function ThermalErosion(Field, Params, Report, Cancel)
{
    const Heights = Field.Heights;
    const N       = Resolution;
    const Delta   = new Float32Array(N * N);
    const Limit   = Math.tan(Params.TalusAngle * Math.PI / 180.0) * TexelSize;
    const Rate    = Math.min(Params.Rate, 0.5);
    const Iterations = Math.round(Params.Iterations);
    // Hardness-aware repose: where strata hardness varies across the field, hard beds are allowed
    // to stand at CliffAngle while soft beds still repose at TalusAngle — the cliff-and-bench
    // staircase of real sedimentary country. On uniform-hardness fields this reduces to classic talus.
    const CliffAngle = (Params.CliffAngle !== undefined) ? Params.CliffAngle : Params.TalusAngle;
    const CliffLimit = Math.tan(CliffAngle * Math.PI / 180.0) * TexelSize;
    const HardnessNorm = new Float32Array(N * N);
    {
        const Hardness = Field.ChannelSamples("Hardness");
        let Lo = 1e9, Hi = -1e9;
        for (let Index = 0; Index < Hardness.length; Index++)
        {
            if (Hardness[Index] < Lo) Lo = Hardness[Index];
            if (Hardness[Index] > Hi) Hi = Hardness[Index];
        }
        if (Hi - Lo > 0.05 && CliffLimit > Limit)
            for (let Index = 0; Index < Hardness.length; Index++)
                HardnessNorm[Index] = (Hardness[Index] - Lo) / (Hi - Lo);
    }

    for (let Iteration = 0; Iteration < Iterations; Iteration++)
    {
        Delta.fill(0.0);
        for (let Z = 1; Z < N - 1; Z++)
        {
            const Row = Z * N;
            for (let X = 1; X < N - 1; X++)
            {
                const Index  = Row + X;
                const Height = Heights[Index];
                const CellLimit = Limit + (CliffLimit - Limit) * HardnessNorm[Index];
                const DiagLimit = CellLimit * 1.41421356;
                // Distribute to ALL over-talused neighbours in proportion to their excess, keeping
                // the same total outflow (MaxExcess * Rate) the old winner-take-all rule used.
                // Dumping everything into the single lowest of four neighbours makes mass travel
                // in single-file preferential paths — iterated dozens of times, that stamps its
                // own rill network onto every steep face (the corduroy this solver used to set).
                const E0 = (Height - Heights[Index - 1])     - CellLimit;
                const E1 = (Height - Heights[Index + 1])     - CellLimit;
                const E2 = (Height - Heights[Index - N])     - CellLimit;
                const E3 = (Height - Heights[Index + N])     - CellLimit;
                const E4 = (Height - Heights[Index - N - 1]) - DiagLimit;
                const E5 = (Height - Heights[Index - N + 1]) - DiagLimit;
                const E6 = (Height - Heights[Index + N - 1]) - DiagLimit;
                const E7 = (Height - Heights[Index + N + 1]) - DiagLimit;
                let MaxExcess = 0.0, SumExcess = 0.0;
                if (E0 > 0.0) { SumExcess += E0; if (E0 > MaxExcess) MaxExcess = E0; }
                if (E1 > 0.0) { SumExcess += E1; if (E1 > MaxExcess) MaxExcess = E1; }
                if (E2 > 0.0) { SumExcess += E2; if (E2 > MaxExcess) MaxExcess = E2; }
                if (E3 > 0.0) { SumExcess += E3; if (E3 > MaxExcess) MaxExcess = E3; }
                if (E4 > 0.0) { SumExcess += E4; if (E4 > MaxExcess) MaxExcess = E4; }
                if (E5 > 0.0) { SumExcess += E5; if (E5 > MaxExcess) MaxExcess = E5; }
                if (E6 > 0.0) { SumExcess += E6; if (E6 > MaxExcess) MaxExcess = E6; }
                if (E7 > 0.0) { SumExcess += E7; if (E7 > MaxExcess) MaxExcess = E7; }
                if (MaxExcess > 0.0)
                {
                    const Scale = MaxExcess * Rate / SumExcess;
                    let Moved = 0.0;
                    if (E0 > 0.0) { const M = E0 * Scale; Delta[Index - 1]     += M; Moved += M; }
                    if (E1 > 0.0) { const M = E1 * Scale; Delta[Index + 1]     += M; Moved += M; }
                    if (E2 > 0.0) { const M = E2 * Scale; Delta[Index - N]     += M; Moved += M; }
                    if (E3 > 0.0) { const M = E3 * Scale; Delta[Index + N]     += M; Moved += M; }
                    if (E4 > 0.0) { const M = E4 * Scale; Delta[Index - N - 1] += M; Moved += M; }
                    if (E5 > 0.0) { const M = E5 * Scale; Delta[Index - N + 1] += M; Moved += M; }
                    if (E6 > 0.0) { const M = E6 * Scale; Delta[Index + N - 1] += M; Moved += M; }
                    if (E7 > 0.0) { const M = E7 * Scale; Delta[Index + N + 1] += M; Moved += M; }
                    Delta[Index] -= Moved;
                }
            }
        }
        for (let Index = 0; Index < Heights.length; Index++)
            Heights[Index] += Delta[Index];

        if ((Iteration & 3) === 0)
        {
            Report(Iteration / Iterations);
            Cancel.ThrowIfRequested();
            await YieldBriefly();
        }
    }
    Report(1.0);
}

//--------------------------------------------------------------------------------------------------------------------------------------------
//                                                                  DRAINAGE SOLUTION
//--------------------------------------------------------------------------------------------------------------------------------------------

// 📝 Priority-flood: every depression is filled to its spill elevation with an ε gradient so the routed
//    surface always drains. Lake depth is (filled − original) — that difference becomes the Water channel.

export async function SolveDrainage(Field, Report, Cancel)
{
    const Heights = Field.Heights;
    const N       = Resolution;
    const Count   = N * N;
    const Filled  = new Float32Array(Heights);
    const Closed  = new Uint8Array(Count);
    const Epsilon = 0.004;

    // Binary min-heap of cell indices keyed by Filled height.
    const Heap = new Int32Array(Count + 8);
    let HeapSize = 0;
    const HeapPush = (Cell) =>
    {
        Heap[++HeapSize] = Cell;
        let Cursor = HeapSize;
        while (Cursor > 1)
        {
            const UpLink = Cursor >> 1;
            if (Filled[Heap[UpLink]] <= Filled[Heap[Cursor]])
                break;
            const Temporary = Heap[UpLink];
            Heap[UpLink] = Heap[Cursor];
            Heap[Cursor] = Temporary;
            Cursor = UpLink;
        }
    };
    const HeapPop = () =>
    {
        const Top = Heap[1];
        Heap[1] = Heap[HeapSize--];
        let Cursor = 1;
        for (;;)
        {
            let Smallest = Cursor;
            const Left  = Cursor * 2;
            const Right = Left + 1;
            if (Left  <= HeapSize && Filled[Heap[Left]]  < Filled[Heap[Smallest]]) Smallest = Left;
            if (Right <= HeapSize && Filled[Heap[Right]] < Filled[Heap[Smallest]]) Smallest = Right;
            if (Smallest === Cursor)
                break;
            const Temporary  = Heap[Cursor];
            Heap[Cursor]     = Heap[Smallest];
            Heap[Smallest]   = Temporary;
            Cursor = Smallest;
        }
        return Top;
    };

    for (let X = 0; X < N; X++)
    {
        const TopCell    = X;
        const BottomCell = (N - 1) * N + X;
        Closed[TopCell] = 1;
        Closed[BottomCell] = 1;
        HeapPush(TopCell);
        HeapPush(BottomCell);
    }
    for (let Z = 1; Z < N - 1; Z++)
    {
        const LeftCell  = Z * N;
        const RightCell = Z * N + N - 1;
        Closed[LeftCell] = 1;
        Closed[RightCell] = 1;
        HeapPush(LeftCell);
        HeapPush(RightCell);
    }

    let Processed = 0;
    const FloodOrder = new Int32Array(Count);
    let Flooded = 0;
    while (HeapSize > 0)
    {
        const Cell = HeapPop();
        FloodOrder[Flooded++] = Cell;
        const CellX = Cell % N;
        const CellZ = (Cell / N) | 0;
        const Spill = Filled[Cell] + Epsilon;
        for (let OffsetZ = -1; OffsetZ <= 1; OffsetZ++)
        {
            for (let OffsetX = -1; OffsetX <= 1; OffsetX++)
            {
                if (OffsetX === 0 && OffsetZ === 0)
                    continue;
                const NeighbourX = CellX + OffsetX;
                const NeighbourZ = CellZ + OffsetZ;
                if (NeighbourX < 0 || NeighbourX >= N || NeighbourZ < 0 || NeighbourZ >= N)
                    continue;
                const Neighbour = NeighbourZ * N + NeighbourX;
                if (Closed[Neighbour])
                    continue;
                Closed[Neighbour] = 1;
                Filled[Neighbour] = Heights[Neighbour] > Spill ? Heights[Neighbour] : Spill;
                HeapPush(Neighbour);
            }
        }
        if ((++Processed & 65535) === 0)
        {
            Report(0.45 * Processed / Count);
            Cancel.ThrowIfRequested();
            await YieldBriefly();
        }
    }

    // Steepest-descent receivers on the filled surface (strictly lower neighbour, diagonal weighted).
    const Receiver = new Int32Array(Count).fill(-1);
    const Donors   = new Int32Array(Count);
    const InvSqrt2 = 1.0 / Math.SQRT2;
    for (let Z = 0; Z < N; Z++)
    {
        for (let X = 0; X < N; X++)
        {
            const Cell = Z * N + X;
            let BestDrop    = 0.0;
            let BestCell    = -1;
            for (let OffsetZ = -1; OffsetZ <= 1; OffsetZ++)
            {
                for (let OffsetX = -1; OffsetX <= 1; OffsetX++)
                {
                    if (OffsetX === 0 && OffsetZ === 0)
                        continue;
                    const NeighbourX = X + OffsetX;
                    const NeighbourZ = Z + OffsetZ;
                    if (NeighbourX < 0 || NeighbourX >= N || NeighbourZ < 0 || NeighbourZ >= N)
                        continue;
                    const Neighbour = NeighbourZ * N + NeighbourX;
                    const Diagonal  = (OffsetX !== 0 && OffsetZ !== 0) ? InvSqrt2 : 1.0;
                    const Drop = (Filled[Cell] - Filled[Neighbour]) * Diagonal;
                    if (Drop > BestDrop)
                    {
                        BestDrop = Drop;
                        BestCell = Neighbour;
                    }
                }
            }
            Receiver[Cell] = BestCell;
            if (BestCell >= 0)
                Donors[BestCell]++;
        }
        if ((Z & 127) === 0)
        {
            Report(0.45 + 0.2 * Z / N);
            Cancel.ThrowIfRequested();
            await YieldBriefly();
        }
    }

    //📝 Kahn upstream order on the D8 donor tree: cells with no donors first. The incision pass
    //   reuses this order (and the single D8 Receiver) to deliver sediment downstream.
    const Order = new Int32Array(Count);
    const Queue = new Int32Array(Count);
    let QueueHead = 0;
    let QueueTail = 0;
    for (let Cell = 0; Cell < Count; Cell++)
    {
        if (Donors[Cell] === 0)
            Queue[QueueTail++] = Cell;
    }
    let Ordered = 0;
    while (QueueHead < QueueTail)
    {
        const Cell = Queue[QueueHead++];
        Order[Ordered++] = Cell;
        const Target = Receiver[Cell];
        if (Target >= 0 && --Donors[Target] === 0)
            Queue[QueueTail++] = Target;
        if ((Ordered & 65535) === 0)
        {
            Report(0.65 + 0.22 * Ordered / Count);
            Cancel.ThrowIfRequested();
            await YieldBriefly();
        }
    }

    // Multiple-flow-direction accumulation (Holmgren slope^4 weights): each cell spreads its
    // catchment over every strictly-lower neighbour instead of only the D8 receiver. Where the
    // ground is channelised the steepest path still captures nearly everything, but on smooth
    // faces the flow disperses and braids — this is the cure for the evenly-spaced parallel
    // rills that single-direction routing engraves on every mountainside. Walking the flood's
    // pop sequence backwards visits donors before any of their receivers.
    const Accumulation = new Float32Array(Count).fill(1.0);
    for (let FloodIndex = Count - 1; FloodIndex >= 0; FloodIndex--)
    {
        const Cell = FloodOrder[FloodIndex];
        const CellX = Cell % N;
        const CellZ = (Cell / N) | 0;
        const HeightHere = Filled[Cell];
        let WeightSum = 0.0;
        for (let OffsetZ = -1; OffsetZ <= 1; OffsetZ++)
        {
            for (let OffsetX = -1; OffsetX <= 1; OffsetX++)
            {
                if (OffsetX === 0 && OffsetZ === 0)
                    continue;
                const Nx = CellX + OffsetX;
                const Nz = CellZ + OffsetZ;
                if (Nx < 0 || Nx >= N || Nz < 0 || Nz >= N)
                    continue;
                const Drop = HeightHere - Filled[Nz * N + Nx];
                if (Drop <= 0.0)
                    continue;
                const SlopeW = Drop * ((OffsetX !== 0 && OffsetZ !== 0) ? InvSqrt2 : 1.0);
                WeightSum += SlopeW * SlopeW * SlopeW * SlopeW;
            }
        }
        if (WeightSum > 0.0)
        {
            const Share = Accumulation[Cell] / WeightSum;
            for (let OffsetZ = -1; OffsetZ <= 1; OffsetZ++)
            {
                for (let OffsetX = -1; OffsetX <= 1; OffsetX++)
                {
                    if (OffsetX === 0 && OffsetZ === 0)
                        continue;
                    const Nx = CellX + OffsetX;
                    const Nz = CellZ + OffsetZ;
                    if (Nx < 0 || Nx >= N || Nz < 0 || Nz >= N)
                        continue;
                    const Neighbour = Nz * N + Nx;
                    const Drop = HeightHere - Filled[Neighbour];
                    if (Drop <= 0.0)
                        continue;
                    const SlopeW = Drop * ((OffsetX !== 0 && OffsetZ !== 0) ? InvSqrt2 : 1.0);
                    Accumulation[Neighbour] += Share * SlopeW * SlopeW * SlopeW * SlopeW;
                }
            }
        }
        if ((FloodIndex & 262143) === 0)
        {
            Report(0.87 + 0.13 * (1.0 - FloodIndex / Count));
            Cancel.ThrowIfRequested();
            await YieldBriefly();
        }
    }
    Report(1.0);
    return { Filled, Receiver, Order, Accumulation, Ordered };
}

//--------------------------------------------------------------------------------------------------------------------------------------------
//                                                                  FLUVIAL INCISION
//--------------------------------------------------------------------------------------------------------------------------------------------

// 📝 Stream power: incision ∝ drainage-area^0.45 × slope, resisted by hardness, with a third of the
//    excavated load handed to the receiver cell — alluvial fans and valley floors build themselves.

export async function FluvialIncision(Field, Params, Report, Cancel)
{
    const Heights = Field.Heights;
    const N       = Resolution;
    const Drainage = await SolveDrainage(Field, (Fraction) => Report(Fraction * 0.55), Cancel);
    const { Filled, Receiver, Order, Accumulation, Ordered } = Drainage;

    let MaxAccumulation = 1.0;
    for (let Index = 0; Index < Accumulation.length; Index++)
    {
        if (Accumulation[Index] > MaxAccumulation)
            MaxAccumulation = Accumulation[Index];
    }
    const LogMax = Math.log(1.0 + MaxAccumulation);

    const Flow       = Field.ChannelSamples("Flow");
    const Water      = Field.ChannelSamples("Water");
    const Deposition = Field.ChannelSamples("Deposition");
    for (let Index = 0; Index < Flow.length; Index++)
    {
        const FlowNorm = Math.log(1.0 + Accumulation[Index]) / LogMax;
        Flow[Index] = FlowNorm;
        const LakeDepth = Filled[Index] - Heights[Index];
        let Standing = LakeDepth > 0.12 ? Math.min((LakeDepth - 0.12) / 6.0, 1.0) : 0.0;
        if (FlowNorm > 0.72)
            Standing = Math.max(Standing, (FlowNorm - 0.72) / 0.28 * 0.85);   // trunk streams hold water
        Water[Index] = Math.max(Water[Index], Standing);
    }

    const Hardness    = Field.ChannelSamples("Hardness");
    const Strength    = Params.Strength;
    const Sedimentation = (Params.Sedimentation !== undefined) ? Params.Sedimentation : 0.55;
    const CapacityScale = (Params.Capacity !== undefined) ? Params.Capacity : 1.0;
    const AreaExponent = 0.45;
    const Iterations   = Math.max(1, Math.round(Params.Iterations));
    const Applied = new Float32Array(Heights.length);
    const Carve   = new Float32Array(Heights.length);
    const Load    = new Float32Array(Heights.length);

    for (let Iteration = 0; Iteration < Iterations; Iteration++)
    {
        Applied.fill(0.0);
        Carve.fill(0.0);
        Load.fill(0.0);
        for (let OrderIndex = 0; OrderIndex < Ordered; OrderIndex++)
        {
            const Cell   = Order[OrderIndex];
            const Target = Receiver[Cell];
            const Incoming = Load[Cell];
            if (Target < 0)
            {
                // World edge or unfilled pit: whatever the river still carries is laid down here —
                // lake deltas and terminal fans form exactly this way.
                if (Incoming > 0.0)
                {
                    const Dump = Math.min(Incoming * Sedimentation, 2.5);
                    Heights[Cell] += Dump;
                    Deposition[Cell] = Math.min(Deposition[Cell] + Dump * 0.22, 1.0);
                }
                continue;
            }
            const AreaNorm = Accumulation[Cell] / MaxAccumulation;
            if (AreaNorm < 0.0004)
            {
                Load[Target] += Incoming;
                continue;
            }
            const CellX = Cell % N;
            const CellZ = (Cell / N) | 0;
            const TargetX = Target % N;
            const TargetZ = (Target / N) | 0;
            const StepMetres = Math.sqrt((CellX - TargetX) * (CellX - TargetX) + (CellZ - TargetZ) * (CellZ - TargetZ)) * TexelSize;
            const SlopeHere = Math.max((Heights[Cell] - Heights[Target]) / StepMetres, 0.0);
            const Resistance = 1.0 - 0.8 * Hardness[Cell];
            // The (0.12 + S) floor stands in for base-level fall: a trunk stream saws downward even
            // where its local grade is gentle — that is how a river crosses a plateau at all.
            let Incision = Strength * Math.pow(AreaNorm, AreaExponent) * (0.12 + Math.min(SlopeHere, 0.7)) * Resistance * 60.0;
            if (Incision > 14.0) Incision = 14.0;
            // Threads without a real catchment do not get to saw — rill-scale wash is the
            // droplet layer's business. (The slope cap above also dropped 1.4 -> 0.7: with the
            // old cap every thread on a steep face incised at trunk-stream rates.)
            if (AreaNorm < 0.0012) Incision = 0.0;
            // Transport limit (the sedimentation half of the river): carrying capacity grows with
            // discharge and grade. An overloaded river deposits the excess here — floodplains and
            // alluvial fans grow where the grade breaks. A loaded river also saws slower (the cover
            // effect), but never below a quarter of its detachment rate: its bedload is its tools.
            const CapacityHere = CapacityScale * Strength * Math.pow(AreaNorm, AreaExponent) * (0.05 + Math.min(SlopeHere, 1.4)) * 60.0;
            let Carried = Incoming;
            if (Carried > CapacityHere)
            {
                const Lay = Math.min((Carried - CapacityHere) * Sedimentation, 1.6);
                if (Lay > 0.0)
                {
                    Heights[Cell] += Lay;
                    Deposition[Cell] = Math.min(Deposition[Cell] + Lay * 0.22, 1.0);
                    Carried -= Lay;
                }
            }
            const Headroom = Math.max(CapacityHere - Carried, Incision * 0.25);
            const Cut = Math.min(Incision, Headroom);
            if (Cut > 0.0)
                Applied[Cell] = Cut;
            // The swath cut below quarries the valley walls too; the load books their volume at 1.6x.
            Load[Target] += Carried + Cut * 1.6;
        }
        // A one-texel slot is not a valley: splat each channel cell's incision across a swath
        // whose half-width grows with drainage area, then cut the max-composited profile once.
        // Thermal relaxation afterwards turns the profile into talus-walled valley cross-sections.
        for (let OrderIndex = 0; OrderIndex < Ordered; OrderIndex++)
        {
            const Cell = Order[OrderIndex];
            const Cut = Applied[Cell];
            if (Cut < 0.06)
                continue;
            const CellX = Cell % N;
            const CellZ = (Cell / N) | 0;
            const Radius = 4 + Math.round(9.0 * Math.sqrt(Accumulation[Cell] / MaxAccumulation));
            for (let Dz = -Radius; Dz <= Radius; Dz++)
            {
                const Nz = CellZ + Dz;
                if (Nz < 0 || Nz >= N)
                    continue;
                for (let Dx = -Radius; Dx <= Radius; Dx++)
                {
                    const Nx = CellX + Dx;
                    if (Nx < 0 || Nx >= N)
                        continue;
                    const D01 = Math.sqrt(Dx * Dx + Dz * Dz) / Radius;
                    if (D01 > 1.0)
                        continue;
                    const Profile = Math.pow(0.5 + 0.5 * Math.cos(D01 * Math.PI), 0.65);
                    const NIndex = Nz * N + Nx;
                    const Candidate = Cut * Profile;
                    if (Candidate > Carve[NIndex])
                        Carve[NIndex] = Candidate;
                }
            }
        }
        for (let Index = 0; Index < Heights.length; Index++)
        {
            const Carved = Carve[Index] * 0.88 * (1.0 - 0.55 * Hardness[Index]);
            const Cut = Applied[Index] > Carved ? Applied[Index] : Carved;
            if (Cut > 0.0)
                Heights[Index] -= Cut;
        }
        Report(0.55 + 0.45 * (Iteration + 1) / Iterations);
        Cancel.ThrowIfRequested();
        await YieldBriefly();
    }
    Report(1.0);
}

//--------------------------------------------------------------------------------------------------------------------------------------------
//                                                                  GLACIAL POLISH
//--------------------------------------------------------------------------------------------------------------------------------------------

// 📝 Ice does not follow the steepest trickle — it quarries the whole valley cross-section. Blending the
//    relief toward a wide-kernel average only where trunk flow runs, plus centreline scour, turns
//    V-notches into U troughs and leaves the arêtes between them untouched.

export function BoxBlurInPlace(Source, RadiusTexels)
{
    const N = Resolution;
    const Horizontal = new Float32Array(Source.length);
    const Radius = Math.max(1, Math.round(RadiusTexels));
    const Window = Radius * 2 + 1;
    for (let Z = 0; Z < N; Z++)
    {
        const Row = Z * N;
        let Running = 0.0;
        for (let X = -Radius; X <= Radius; X++)
            Running += Source[Row + (X < 0 ? 0 : X)];
        for (let X = 0; X < N; X++)
        {
            Horizontal[Row + X] = Running / Window;
            const Leaving  = Source[Row + Math.max(X - Radius, 0)];
            const Entering = Source[Row + Math.min(X + Radius + 1, N - 1)];
            Running += Entering - Leaving;
        }
    }
    const Result = new Float32Array(Source.length);
    for (let X = 0; X < N; X++)
    {
        let Running = 0.0;
        for (let Z = -Radius; Z <= Radius; Z++)
            Running += Horizontal[(Z < 0 ? 0 : Z) * N + X];
        for (let Z = 0; Z < N; Z++)
        {
            Result[Z * N + X] = Running / Window;
            const Leaving  = Horizontal[Math.max(Z - Radius, 0) * N + X];
            const Entering = Horizontal[Math.min(Z + Radius + 1, N - 1) * N + X];
            Running += Entering - Leaving;
        }
    }
    return Result;
}

export async function GlacialPolish(Field, Params, Report, Cancel)
{
    const Heights = Field.Heights;
    const Flow    = Field.ChannelSamples("Flow");
    const Blurred = BoxBlurInPlace(Heights, Params.WidthTexels);
    Report(0.5);
    await YieldBriefly();
    Cancel.ThrowIfRequested();

    const Strength = Params.Strength;
    const Scour    = Params.ScourMetres;
    for (let Index = 0; Index < Heights.length; Index++)
    {
        const FlowHere = Flow[Index];
        if (FlowHere < 0.3)
            continue;
        let Trunk = (FlowHere - 0.3) / 0.5;
        Trunk = Trunk > 1.0 ? 1.0 : Trunk * Trunk * (3.0 - 2.0 * Trunk);
        const Blend = Strength * Trunk;
        Heights[Index] += (Blurred[Index] - Scour * Trunk - Heights[Index]) * Blend;
    }
    Report(1.0);
}

//--------------------------------------------------------------------------------------------------------------------------------------------
//                                                                  AEOLIAN SLAB TRANSPORT
//--------------------------------------------------------------------------------------------------------------------------------------------

// 📝 The Nishimori slab model: a slab of sand is lifted, hops downwind, and settles with a probability
//    that jumps to certainty inside the 15° wind shadow. Local avalanching keeps slip faces at 34°.

export async function AeolianSettle(Field, Params, Report, Cancel)
{
    const Heights    = Field.Heights;
    const Deposition = Field.ChannelSamples("Deposition");
    const Hardness   = Field.ChannelSamples("Hardness");
    const N          = Resolution;
    const NextRandom = ConstructRandomStream(Params.Seed);

    const WindRadians = Params.WindAngle * Math.PI / 180.0;
    const WindX = Math.cos(WindRadians);
    const WindZ = Math.sin(WindRadians);
    const HopTexels   = 5.0;
    const ShadowDrop  = Math.tan(15.0 * Math.PI / 180.0) * HopTexels * TexelSize;
    const ReposeLimit = Math.tan(34.0 * Math.PI / 180.0) * TexelSize;
    const SlabCount   = Math.round(Params.Slabs);
    const SlabSize    = 0.12;

    for (let Slab = 0; Slab < SlabCount; Slab++)
    {
        let SourceX = 4 + Math.floor(NextRandom() * (N - 8));
        let SourceZ = 4 + Math.floor(NextRandom() * (N - 8));
        const SourceIndex = SourceZ * N + SourceX;
        // Loose, already-deposited sand entrains far more readily than bedrock.
        const Entrainment = 0.25 + Deposition[SourceIndex] * 0.75 - Hardness[SourceIndex] * 0.2;
        if (NextRandom() > Entrainment)
            continue;
        Heights[SourceIndex] -= SlabSize;

        let PosX = SourceX;
        let PosZ = SourceZ;
        let LandedIndex = SourceIndex;
        for (let Hop = 0; Hop < 7; Hop++)
        {
            const FromIndex = Math.floor(PosZ) * N + Math.floor(PosX);
            PosX += WindX * HopTexels;
            PosZ += WindZ * HopTexels;
            if (PosX < 2 || PosX >= N - 2 || PosZ < 2 || PosZ >= N - 2)
            {
                LandedIndex = FromIndex;
                break;
            }
            LandedIndex = Math.floor(PosZ) * N + Math.floor(PosX);
            const InShadow = (Heights[FromIndex] - Heights[LandedIndex]) > ShadowDrop;
            const SettleChance = InShadow ? 1.0 : (Deposition[LandedIndex] > 0.15 ? 0.45 : 0.12);
            if (NextRandom() < SettleChance)
                break;
        }
        Heights[LandedIndex] += SlabSize;
        Deposition[LandedIndex] = Math.min(Deposition[LandedIndex] + 0.02, 1.0);

        // Avalanching around the landing cell.
        for (let Relax = 0; Relax < 3; Relax++)
        {
            const LX = LandedIndex % N;
            const LZ = (LandedIndex / N) | 0;
            if (LX < 1 || LX >= N - 1 || LZ < 1 || LZ >= N - 1)
                break;
            let LowestIndex = LandedIndex;
            let Lowest = Heights[LandedIndex];
            const Candidates = [LandedIndex - 1, LandedIndex + 1, LandedIndex - N, LandedIndex + N];
            for (const Candidate of Candidates)
            {
                if (Heights[Candidate] < Lowest)
                {
                    Lowest = Heights[Candidate];
                    LowestIndex = Candidate;
                }
            }
            const Excess = Heights[LandedIndex] - Lowest - ReposeLimit;
            if (Excess <= 0.0 || LowestIndex === LandedIndex)
                break;
            Heights[LandedIndex] -= Excess * 0.5;
            Heights[LowestIndex] += Excess * 0.5;
        }

        if ((Slab & 16383) === 0)
        {
            Report(Slab / SlabCount);
            Cancel.ThrowIfRequested();
            await YieldBriefly();
        }
    }
    Report(1.0);
}

//--------------------------------------------------------------------------------------------------------------------------------------------
//                                                                  SNOW ACCUMULATION
//--------------------------------------------------------------------------------------------------------------------------------------------

// 📝 Snow settles where altitude clears the (noise-wobbled) snowline and the slope can hold it; hollows
//    drift deeper than crests. Writes the Snow channel and adds real metres to the relief.

export async function SnowAccumulation(Field, Params, Noise, Report, Cancel)
{
    const Heights = Field.Heights;
    const Snow    = Field.ChannelSamples("Snow");
    const N       = Resolution;
    const Blurred = BoxBlurInPlace(Heights, 4);
    Report(0.35);
    await YieldBriefly();
    Cancel.ThrowIfRequested();

    const Snowline     = Params.Snowline;
    const BandMetres   = Math.max(Params.Band, 4.0);
    const SlopeLimit   = Math.tan(Params.SlopeLimit * Math.PI / 180.0);
    const Depth        = Params.Depth;
    const DriftScale   = 3.0 / N;

    for (let Z = 0; Z < N; Z++)
    {
        for (let X = 0; X < N; X++)
        {
            const Index = Z * N + X;
            const Wobble = Noise.Fractal(X * DriftScale, Z * DriftScale, 3, 2.0, 0.5) * BandMetres * 2.2;
            let Cover = (Heights[Index] - (Snowline + Wobble)) / BandMetres;
            Cover = Cover < 0.0 ? 0.0 : Cover > 1.0 ? 1.0 : Cover;
            Cover = Cover * Cover * (3.0 - 2.0 * Cover);
            if (Cover <= 0.0)
                continue;
            const X0 = X > 0 ? X - 1 : X;
            const X1 = X < N - 1 ? X + 1 : X;
            const Z0 = Z > 0 ? Z - 1 : Z;
            const Z1 = Z < N - 1 ? Z + 1 : Z;
            // Slope from the blurred surface: snow slabs respond to the face angle over metres,
            // not to every texel-scale groove wall (which would shed the whole face bare).
            const GradX = (Blurred[Z * N + X1] - Blurred[Z * N + X0]) / ((X1 - X0) * TexelSize);
            const GradZ = (Blurred[Z1 * N + X] - Blurred[Z0 * N + X]) / ((Z1 - Z0) * TexelSize);
            const SlopeHere = Math.sqrt(GradX * GradX + GradZ * GradZ);
            let Hold = 1.0 - Math.min(SlopeHere / (SlopeLimit * 1.9), 1.0);
            Hold = Hold * Hold;
            const Stored = Cover * (0.45 + 0.55 * Hold);
            Snow[Index] = Math.max(Snow[Index], Stored);
            const Drift = Math.max(Blurred[Index] - Heights[Index], 0.0) * 0.55;
            Heights[Index] += Stored * Depth + Drift * Cover * Hold;
        }
        if ((Z & 127) === 0)
        {
            Report(0.35 + 0.65 * Z / N);
            Cancel.ThrowIfRequested();
            await YieldBriefly();
        }
    }
    Report(1.0);
}

//--------------------------------------------------------------------------------------------------------------------------------------------
//                                                                  SURFACE DATA BAKE
//--------------------------------------------------------------------------------------------------------------------------------------------

// 📝 Data maps baked from the finished heightfield: multi-scale occlusion (how buried a texel sits
//    inside the landform, shaded by how much sky its slope can see) and protrusion (how proud a crest
//    or edge stands). The splat shader textures from these — plus height, sediment and flow — using
//    flat material colours, the way dedicated erosion tools hand data to a texturing stage.
export function BakeSurfaceData(Field)
{
    const Heights = Field.Heights;
    const N = Resolution;
    const Occlusion  = Field.ChannelSamples("Occlusion");
    const Protrusion = Field.ChannelSamples("Protrusion");

    // BoxBlurInPlace returns a fresh array (its name lies); the source is left untouched.
    const Near = BoxBlurInPlace(Heights, 3);
    const Mid  = BoxBlurInPlace(Heights, 14);
    const Far  = BoxBlurInPlace(Heights, 48);

    for (let Z = 0; Z < N; Z++)
    {
        const Row = Z * N;
        const RowUp = (Z > 0 ? Z - 1 : Z) * N;
        const RowDown = (Z < N - 1 ? Z + 1 : Z) * N;
        for (let X = 0; X < N; X++)
        {
            const Index = Row + X;
            const H = Heights[Index];
            // Burial at three scales: rills, valleys, whole basins.
            const Burial = 0.14 * Math.max(Near[Index] - H, 0.0) / 1.4
                         + 0.36 * Math.max(Mid[Index]  - H, 0.0) / 7.0
                         + 0.22 * Math.max(Far[Index]  - H, 0.0) / 26.0;
            const GradX = (Heights[Row + Math.min(X + 1, N - 1)] - Heights[Row + Math.max(X - 1, 0)]) / (2.0 * TexelSize);
            const GradY = (Heights[RowDown + X] - Heights[RowUp + X]) / (2.0 * TexelSize);
            const SkyFacing = 1.0 / Math.sqrt(1.0 + GradX * GradX + GradY * GradY);
            let Occ = (1.0 - Burial) * (0.55 + 0.45 * SkyFacing);
            Occlusion[Index] = Occ < 0.0 ? 0.0 : Occ > 1.0 ? 1.0 : Occ;
            const Pro = 0.70 * Math.max(H - Mid[Index], 0.0) / 6.5
                      + 0.20 * Math.max(H - Near[Index], 0.0) / 1.8;
            Protrusion[Index] = Pro > 1.0 ? 1.0 : Pro;
        }
    }
}
