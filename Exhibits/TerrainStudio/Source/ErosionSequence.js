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

import { Resolution, WorldExtent, TexelSize, ConstructRandomStream, LatticeNoise, SimplexNoise, GradientNoise3, Mulberry32, HashCoords } from "./ReliefField.js?v=13";

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
    // Keep rill erosion brush tight (<= 2 texels) so droplets carve sharp couloirs instead of 18m-wide rounded troughs.
    const Radius           = Math.min(Math.max(1, Math.round(Params.Radius * 0.5)), 2);

    // Precompute ridge-crest bedrock shield so raindrops flow off sharp arêtes & horns without blunting them.
    const SmoothCrest = BoxBlurInPlace(Heights, 5);
    const CrestShield = new Float32Array(N * N);
    for (let Index = 0; Index < Heights.length; Index++)
    {
        const Convex = Math.max(Heights[Index] - SmoothCrest[Index], 0.0);
        CrestShield[Index] = Math.max(Hardness[Index], Math.min(Convex / 5.5, 0.92));
    }

    // Brush offsets with sharp falloff, normalised once.
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
                const Weight = Math.pow(1.0 - Distance / (Radius + 0.35), 1.5);
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
                // Horton overland flow ramp: droplets on summit divides (Step < 5) gather flow before incising bedrock.
                const StepRamp = Math.min(Step / 5.0, 1.0);
                let Amount = Math.min((Capacity - Sediment) * ErodeRate * StepRamp, EffectiveDrop > 0.0 ? EffectiveDrop : 0.0);
                if (Amount > 0.0)
                {
                    for (let BrushIndex = 0; BrushIndex < Offsets.length; BrushIndex++)
                    {
                        const TargetX = CellX + Offsets[BrushIndex][0];
                        const TargetY = CellY + Offsets[BrushIndex][1];
                        if (TargetX < 0 || TargetX >= N || TargetY < 0 || TargetY >= N)
                            continue;
                        const TargetIndex = TargetY * N + TargetX;
                        const Resistance  = 1.0 - 0.88 * CrestShield[TargetIndex];
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
    const RawCliff = (Params.CliffAngle !== undefined) ? Params.CliffAngle : Params.TalusAngle;
    const CliffAngle = RawCliff > Params.TalusAngle ? Math.max(RawCliff, 75.0) : RawCliff;
    const CliffLimit = Math.tan(CliffAngle * Math.PI / 180.0) * TexelSize;
    const HardnessNorm = new Float32Array(N * N);
    if (CliffLimit > Limit)
    {
        const Hardness   = Field.ChannelSamples("Hardness");
        const Deposition = Field.ChannelSamples("Deposition");
        let Lo = 1e9, Hi = -1e9;
        let HMin = 1e9, HMax = -1e9;
        for (let Index = 0; Index < Hardness.length; Index++)
        {
            if (Hardness[Index] < Lo) Lo = Hardness[Index];
            if (Hardness[Index] > Hi) Hi = Hardness[Index];
            if (Heights[Index] < HMin) HMin = Heights[Index];
            if (Heights[Index] > HMax) HMax = Heights[Index];
        }
        const HSpan = Math.max(HMax - HMin, 1.0);
        const SmoothBase = BoxBlurInPlace(Heights, 8);
        const HasStrata = (Hi - Lo > 0.05);
        for (let Index = 0; Index < Hardness.length; Index++)
        {
            // Crystalline bedrock competence: convex arêtes/horns (Heights > SmoothBase) hold steep CliffAngle (75°+)
            // so peaks stay razor-sharp, while concave chutes & aprons relax at TalusAngle (33-35°) into scree fans.
            const Elev01 = (Heights[Index] - HMin) / HSpan;
            const Protrusion = Math.min(Math.max((Heights[Index] - SmoothBase[Index] + 2.5) / 14.0, 0.0), 1.0);
            const Bedrock = Math.min(Math.max(Protrusion * 0.82 + Math.max(Elev01 - 0.22, 0.0) * 0.60 - Deposition[Index] * 0.70, 0.0), 0.98);
            if (HasStrata)
            {
                const StrataH = (Hardness[Index] - Lo) / (Hi - Lo);
                HardnessNorm[Index] = Math.max(StrataH, Bedrock * 0.55);
            }
            else
            {
                HardnessNorm[Index] = Bedrock;
                Hardness[Index] = 0.25 + 0.70 * Bedrock;
            }
        }
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
        Report(0.45 + 0.35 * (Iteration + 1) / Iterations);
        Cancel.ThrowIfRequested();
        await YieldBriefly();
    }
    await BakeHydrologyChannels(Field, Percent => Report(0.80 + 0.20 * Percent), Cancel);
    Report(1.0);
}

// 📝 Post-incision hydrology solver: re-solves drainage on the carved valleys, fills closed topographic
//    depressions into flat-surfaced perched lakes/tarns at their spillway elevations, and dilates trunk
//    streams into continuous multi-texel rivers and braided channels bordered by alluvial gravel bars.
export async function BakeHydrologyChannels(Field, Report, Cancel)
{
    const N = Resolution;
    const Heights    = Field.Heights;
    const Flow       = Field.ChannelSamples("Flow");
    const Water      = Field.ChannelSamples("Water");
    const Deposition = Field.ChannelSamples("Deposition");

    const { Filled, Receiver, Order, Ordered, Accumulation } = await SolveDrainage(
        Field, Percent => Report(Percent * 0.65), Cancel
    );
    let MaxAccumulation = 1.0;
    for (let Index = 0; Index < Accumulation.length; Index++)
    {
        if (Accumulation[Index] > MaxAccumulation)
            MaxAccumulation = Accumulation[Index];
    }
    const LogMax = Math.log(1.0 + MaxAccumulation);

    const RiverSeed = new Float32Array(Heights.length);
    const BankSeed  = new Float32Array(Heights.length);
    Water.fill(0.0);

    for (let Index = 0; Index < Heights.length; Index++)
    {
        const FlowNorm = Math.log(1.0 + Accumulation[Index]) / LogMax;
        Flow[Index] = FlowNorm;

        const X = Index % N, Z = (Index / N) | 0;
        const Target = Receiver[Index];
        let LocalSlope = 0.03;
        if (Target >= 0)
        {
            const Tx = Target % N, Tz = (Target / N) | 0;
            const Step = Math.sqrt((X - Tx) * (X - Tx) + (Z - Tz) * (Z - Tz)) * TexelSize;
            LocalSlope = Math.max((Heights[Index] - Heights[Target]) / Step, 0.0);
        }

        // 1. Bounded valley tarns & pools (shallow depressions 0.35m..12m deep on gentle valley floors).
        const LakeDepth = Filled[Index] - Heights[Index];
        let Standing = 0.0;
        if (LakeDepth > 0.35 && LakeDepth < 12.5 && LocalSlope < 0.08)
        {
            Standing = Math.min(0.28 + (LakeDepth - 0.35) / 6.0, 0.96);
            BankSeed[Index] = Math.max(BankSeed[Index], 0.55);
        }

        // 2. Major valley-bottom trunk rivers & primary tributaries only (FlowNorm > 0.76).
        if (FlowNorm > 0.76)
        {
            const StreamStrength = Math.min((FlowNorm - 0.76) / 0.24, 1.0);
            const PoolBonus = LocalSlope < 0.04 ? (1.0 - LocalSlope / 0.04) * 0.28 : 0.0;
            const RiverDepth = Math.min(0.24 + StreamStrength * 0.64 + PoolBonus, 0.94);
            RiverSeed[Index] = Math.max(RiverSeed[Index], RiverDepth);
            BankSeed[Index]  = Math.max(BankSeed[Index], StreamStrength);
            Standing = Math.max(Standing, RiverDepth);
        }
        Water[Index] = Standing;
    }

    // Dilate trunk rivers by 1 texel into crisp 3-6m wide valley rivers bordered by alluvial gravel bars.
    const DilatedRiver = BoxBlurInPlace(RiverSeed, 1);
    const DilatedBanks = BoxBlurInPlace(BankSeed, 3);
    for (let Index = 0; Index < Heights.length; Index++)
    {
        const ChannelW = Math.min(DilatedRiver[Index] * 1.85, 0.90);
        if (ChannelW > 0.16)
        {
            Water[Index] = Math.max(Water[Index], ChannelW);
            Heights[Index] -= ChannelW * 0.35;
        }
        const BankW = Math.min(DilatedBanks[Index] * 1.9, 0.85);
        if (BankW > 0.08)
            Deposition[Index] = Math.min(Deposition[Index] + BankW * 0.30, 1.0);
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
    const Heights    = Field.Heights;
    const Flow       = Field.ChannelSamples("Flow");
    const Deposition = Field.ChannelSamples("Deposition");
    const Width      = Math.max(4, Math.round(Params.WidthTexels));
    const NearWidth  = Math.max(3, Math.round(Width * 0.45));
    const BlurredNear = BoxBlurInPlace(Heights, NearWidth);
    const BlurredWide = BoxBlurInPlace(Heights, Width);
    Report(0.35);
    await YieldBriefly();
    Cancel.ThrowIfRequested();

    // Dilate the trunk drainage and any pinched V-notches (\/) across the full trough width so the
    // glacier acts on the whole valley cross-section rather than the 1-texel river thread.
    const Seed = new Float32Array(Heights.length);
    for (let Index = 0; Index < Heights.length; Index++)
    {
        const FlowHere = Flow[Index];
        const FlowTerm = FlowHere > 0.22 ? Math.min((FlowHere - 0.22) / 0.48, 1.0) : 0.0;
        const Pinch = Math.max(BlurredNear[Index] - Heights[Index], 0.0);
        const PinchTerm = Math.min(Pinch / 14.0, 1.0);
        Seed[Index] = Math.max(FlowTerm, PinchTerm * 0.8);
    }
    const TroughSwath = BoxBlurInPlace(Seed, Math.max(4, Math.round(Width * 0.65)));
    Report(0.7);
    await YieldBriefly();
    Cancel.ThrowIfRequested();

    const Strength = Params.Strength;
    const Scour    = Params.ScourMetres;
    const Water    = Field.ChannelSamples("Water");
    for (let Index = 0; Index < Heights.length; Index++)
    {
        // Gate glacial action strictly to valleys & cirque concavities (Heights <= BlurredWide + 2m)
        // so glaciers NEVER shave or round off the sharp arête crests and pyramidal horns above them!
        const Concavity = BlurredWide[Index] + 2.0 - Heights[Index];
        if (Concavity <= 0.0)
            continue;
        const ValleyMask = Math.min(Concavity / 14.0, 1.0);
        const Swath = Math.min(TroughSwath[Index] * 2.2, 1.0) * ValleyMask;
        const Pinch = Math.max(BlurredNear[Index] - Heights[Index], 0.0);
        if (Swath < 0.02 && Pinch < 0.25)
            continue;
        const Trough = Swath * Swath * (3.0 - 2.0 * Swath);
        const FloorTarget = Math.min(BlurredNear[Index], BlurredWide[Index]) - Scour * Trough * 0.65;
        const PinchLift = Pinch * Strength * 0.65 * ValleyMask;
        const TroughCut = (FloorTarget - Heights[Index]) * Strength * Trough * 0.72;
        Heights[Index] += PinchLift + TroughCut;
        if (Trough > 0.25 && Heights[Index] <= BlurredNear[Index] + 2.0)
            Deposition[Index] = Math.min(Deposition[Index] + Trough * Strength * 0.22, 1.0);
        // Overdeepened glacial cirque pockets & valley benches hold tarn water.
        if (Trough > 0.55 && Concavity > 6.5 && Flow[Index] > 0.68)
            Water[Index] = Math.max(Water[Index], Math.min((Trough - 0.45) * 1.1, 0.85));
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
    const Source  = new Float32Array(Heights);
    const Snow    = Field.ChannelSamples("Snow");
    const Flow    = Field.ChannelSamples("Flow");
    const N       = Resolution;
    const Blurred = BoxBlurInPlace(Source, 4);
    const Wide    = BoxBlurInPlace(Source, 16);
    Report(0.35);
    await YieldBriefly();
    Cancel.ThrowIfRequested();

    const Snowline   = Params.Snowline;
    const BandMetres = Math.max(Params.Band, 12.0);
    // Realistic alpine snow-holding threshold: snow blankets high cirques, benches, and upper slopes up to ~38-44 deg,
    // while steeper cliff walls (> 42 deg) and protruding bedrock outcrops shed snow to expose dark rock.
    const CritSlope  = Math.min(Math.tan(Params.SlopeLimit * Math.PI / 180.0) * 0.86, 0.94);
    const Depth      = Params.Depth;
    const DriftScale = 3.2 / N;

    for (let Z = 0; Z < N; Z++)
    {
        for (let X = 0; X < N; X++)
        {
            const Index = Z * N + X;
            const X0 = X > 0 ? X - 1 : X;
            const X1 = X < N - 1 ? X + 1 : X;
            const Z0 = Z > 0 ? Z - 1 : Z;
            const Z1 = Z < N - 1 ? Z + 1 : Z;

            const BlurGx = (Blurred[Z * N + X1] - Blurred[Z * N + X0]) / ((X1 - X0) * TexelSize);
            const BlurGz = (Blurred[Z1 * N + X] - Blurred[Z0 * N + X]) / ((Z1 - Z0) * TexelSize);
            const SlopeHere = Math.sqrt(BlurGx * BlurGx + BlurGz * BlurGz);

            // Multi-scale concavity from immutable Source: > 0 in cirques/couloirs, < 0 on convex ridges.
            const Concavity = (Wide[Index] - Source[Index]) * 0.65 + (Blurred[Index] - Source[Index]) * 0.55;
            const CouloirBonus   = Math.max(Concavity, 0.0) * 3.4 + Flow[Index] * 26.0;
            const RidgeWindStrip = Math.max(-Concavity - 2.2, 0.0) * 3.0;

            const Wobble = Noise.Fractal(X * DriftScale, Z * DriftScale, 3, 2.0, 0.5) * BandMetres * 0.55;
            const LocalSnowline = Snowline + Wobble - CouloirBonus + RidgeWindStrip;
            let Cover = (Source[Index] - LocalSnowline) / BandMetres;
            Cover = Cover < 0.0 ? 0.0 : Cover > 1.0 ? 1.0 : Cover;
            Cover = Cover * Cover * (3.0 - 2.0 * Cover);
            if (Cover <= 0.0)
                continue;

            // Steep cliff faces shed snow to bare rock; upper benches, shoulders, and couloirs hold continuous snowfields.
            const CouloirHold = Concavity > 0.5 ? Math.min(Concavity / 8.0, 0.24) : 0.0;
            const EffectiveCrit = CritSlope + CouloirHold;
            let Hold = 1.0 - Math.min(Math.max((SlopeHere - EffectiveCrit * 0.50) / Math.max(EffectiveCrit * 0.52, 0.12), 0.0), 1.0);
            Hold = Hold * Hold * (3.0 - 2.0 * Hold);

            // Wind scours only the sharpest knife-edge arêtes & horns so rock crags pierce through coherent snowfields.
            const WindScour = Concavity < -2.0 ? Math.max(0.18, 1.0 - (-Concavity - 2.0) * 0.085) : 1.0;

            const Stored = Math.min(Cover * Hold * WindScour, 1.0);
            Snow[Index] = Math.max(Snow[Index], Stored);
        }
        if ((Z & 127) === 0)
        {
            Report(0.35 + 0.55 * Z / N);
            Cancel.ThrowIfRequested();
            await YieldBriefly();
        }
    }

    // Smooth the snow depth addition before applying to Heights so snow drifts never add 1-texel roughness.
    const SmoothSnow = BoxBlurInPlace(Snow, 3);
    for (let Index = 0; Index < Heights.length; Index++)
        Heights[Index] = Source[Index] + SmoothSnow[Index] * Depth * 0.45;
    Report(1.0);
}

//--------------------------------------------------------------------------------------------------------------------------------------------
//                                                                  SURFACE DATA BAKE
//--------------------------------------------------------------------------------------------------------------------------------------------

// 📝 Data maps baked from the finished heightfield: multi-scale occlusion (how buried a texel sits
//    inside the landform, shaded by how much sky its slope can see) and protrusion (how proud a crest
//    or edge stands). The splat shader textures from these — plus height, sediment and flow — using
//    flat material colours, the way dedicated erosion tools hand data to a texturing stage.
// 📝 Synthesises Gaea-style jagged bedrock outcrops/crags along ridges & steep flanks and scatters
//    angular rockfall boulders across talus aprons, moraines, and valley benches. Outcrops strip
//    overlying snow/soil on their steep protruding crowns and boost Hardness & Protrusion.
export function ApplyRuggedOutcropsAndRocks(Field, Params = {})
{
    const Heights    = Field.Heights;
    const Snow       = Field.ChannelSamples("Snow");
    const Deposition = Field.ChannelSamples("Deposition");
    const Hardness   = Field.ChannelSamples("Hardness");
    const Water      = Field.ChannelSamples("Water");
    const Wear       = Field.ChannelSamples("Wear");
    const N          = Resolution;

    const OutcropAmp = (Params.OutcropAmplitude !== undefined) ? Params.OutcropAmplitude : 18.5;
    const RockAmp    = (Params.RockAmplitude !== undefined)    ? Params.RockAmplitude    : 5.8;
    const Density    = (Params.Density !== undefined)          ? Params.Density          : 0.58;
    const Seed       = (Params.Seed !== undefined)             ? Params.Seed             : 7331;
    const Noise      = new LatticeNoise(Seed ^ 0x6F93);

    const Source = new Float32Array(Heights);
    const Near   = BoxBlurInPlace(Source, 4);
    const Mid    = BoxBlurInPlace(Source, 16);
    const OutcropField = new Float32Array(N * N);
    const BoulderField = new Float32Array(N * N);

    let HMin = 1e9, HMax = -1e9;
    for (let Index = 0; Index < Source.length; Index++)
    {
        if (Source[Index] < HMin) HMin = Source[Index];
        if (Source[Index] > HMax) HMax = Source[Index];
    }
    const HSpan = Math.max(HMax - HMin, 1.0);
    const Thresh = 0.65 - Density * 0.18;

    for (let Z = 2; Z < N - 2; Z++)
    {
        const Row = Z * N;
        for (let X = 2; X < N - 2; X++)
        {
            const Index = Row + X;
            if (Water[Index] > 0.12)
                continue;

            const Gx = (Near[Row + X + 1] - Near[Row + X - 1]) / (2.0 * TexelSize);
            const Gz = (Near[(Z + 1) * N + X] - Near[(Z - 1) * N + X]) / (2.0 * TexelSize);
            const Slope = Math.sqrt(Gx * Gx + Gz * Gz);
            const Elev01 = (Source[Index] - HMin) / HSpan;
            const RidgeProtrusion = Math.max(Source[Index] - Mid[Index] + 1.5, 0.0);
            const LocalConvex = Math.max(Source[Index] - Near[Index] + 0.3, 0.0);

            // 1. Rugged Bedrock Outcrops & Crags (bold Gaea-style stepped rock buttresses & ridge gendarmes):
            const SlopeMask = Math.min(Math.max((Slope - 0.30) / 0.26, 0.0), 1.0)
                            * (1.0 - Math.min(Math.max((Slope - 2.10) / 0.65, 0.0), 1.0));
            const RidgeBonus = Math.min(RidgeProtrusion / 14.0, 1.0) * 0.72 + Math.min(LocalConvex / 3.8, 1.0) * 0.28;
            const OutcropZone = Math.max(SlopeMask * (0.38 + 0.62 * Elev01), RidgeBonus * 0.90);

            if (OutcropZone > 0.14 && OutcropAmp > 0.01)
            {
                const Ux = X * 0.025 + Gx * 0.48;
                const Uz = Z * 0.025 + Gz * 0.48;
                const Cluster = Noise.Ridged(Ux * 0.68 + 3.7, Uz * 0.68 - 8.1, 2, 2.05, 0.48, 1.55);
                if (Cluster > Thresh)
                {
                    const ClusterW = Math.min((Cluster - Thresh) / Math.max(1.0 - Thresh, 0.08), 1.0);
                    const BlockA = Noise.Ridged(Ux * 1.65 - Uz * 0.75 + 19.1, Uz * 1.65 + Ux * 0.75, 2, 2.1, 0.50, 1.80);
                    const BlockB = 1.0 - Math.abs(Noise.Sample(X * 0.064 + 7.3, Z * 0.064 - 4.9));
                    const AngularCrag = Math.pow(Math.max(BlockA * 0.72 + Math.max(BlockB, 0.0) * 0.28, 0.0), 1.45);
                    // Stepped rock joint ledges along elevation so outcrops have blocky fracture benches.
                    const JointPhase = (Source[Index] * 0.10 + BlockA * 0.95);
                    const JointStep  = 0.72 + 0.28 * Math.floor((JointPhase - Math.floor(JointPhase)) * 3.0) / 2.0;
                    OutcropField[Index] = OutcropAmp * OutcropZone * ClusterW * AngularCrag * JointStep;
                }
            }

            // 2. Scattered Talus Boulders & Rockfall Blocks (multi-texel angular boulders on scree & benches):
            const TalusSlope = Math.min(Math.max((Slope - 0.10) / 0.16, 0.0), 1.0)
                             * (1.0 - Math.min(Math.max((Slope - 0.82) / 0.22, 0.0), 1.0));
            const FootHollow = Math.min(Math.max((Mid[Index] - Source[Index] + 1.2) / 9.5, 0.0), 1.0);
            const BoulderZone = TalusSlope * Math.min(Deposition[Index] * 1.60 + FootHollow * 0.60 + Wear[Index] * 0.32, 1.0);

            if (BoulderZone > 0.16 && RockAmp > 0.01)
            {
                const Patch = Noise.Sample(X * 0.036 + 5.1, Z * 0.036 - 9.4) * 0.5 + 0.5;
                if (Patch > 0.42)
                {
                    // Multi-texel cellular boulder cones (6-12 m across) + medium blocks.
                    const CellA = 1.0 - Noise.Cellular(X * 0.088 + 31.4, Z * 0.088 + 12.8);
                    const CellB = 1.0 - Noise.Cellular(X * 0.145 - 17.2, Z * 0.145 + 43.1);
                    const DomeA = Math.pow(Math.max(CellA - 0.46, 0.0) / 0.54, 1.85);
                    const DomeB = Math.pow(Math.max(CellB - 0.52, 0.0) / 0.48, 1.95) * 0.55;
                    BoulderField[Index] = RockAmp * BoulderZone * (DomeA + DomeB) * ((Patch - 0.42) / 0.58);
                }
            }
        }
    }

    const SmoothOutcrop = BoxBlurInPlace(OutcropField, 1);
    for (let Index = 0; Index < Heights.length; Index++)
    {
        // Keep 82% of raw angular crag relief so outcrops and ridge teeth stay sharp and chiseled.
        const OutLift = 0.82 * OutcropField[Index] + 0.18 * SmoothOutcrop[Index];
        const BldLift = BoulderField[Index];
        const TotalLift = OutLift + BldLift;
        if (TotalLift > 0.08)
        {
            Heights[Index] += TotalLift;
            if (OutLift > 2.6 || BldLift > 1.1)
            {
                const Strip = Math.min(Math.max((OutLift - 2.6) / 3.8, (BldLift - 0.8) / 1.8), 0.90);
                Snow[Index] *= (1.0 - Strip);
            }
            Hardness[Index] = Math.max(Hardness[Index], Math.min(0.64 + TotalLift * 0.12, 0.98));
        }
    }
}


//--------------------------------------------------------------------------------------------------------------------------------------------
//                                              SLATE STRATIGRAPHIC PACKAGES & DIP (STRATA-MODEL PORT)
//--------------------------------------------------------------------------------------------------------------------------------------------

function SmoothStep01(Edge0, Edge1, X)
{
    const T = Math.min(1.0, Math.max(0.0, (X - Edge0) / Math.max(Edge1 - Edge0, 1e-6)));
    return T * T * (3.0 - 2.0 * T);
}

export function ConstructBedTable(Params)
{
    const Band      = Math.max(2.0, Params.BandMetres || Params.strataBand || 26.0);
    const Variation = Params.Variation !== undefined ? Params.Variation : 0.6;
    const Packaging = Params.Packaging !== undefined ? Params.Packaging : 0.6;
    const HardShare = Params.HardShare !== undefined ? Params.HardShare : 0.38;
    const Seed      = (Params.Seed || 1) | 0;
    const NextRand  = Mulberry32(((Seed * 977 + 13) >>> 0));
    const Gauss = () =>
    {
        const U = Math.max(1e-6, NextRand()), W = NextRand();
        return Math.sqrt(-2.0 * Math.log(U)) * Math.cos(2.0 * Math.PI * W);
    };
    const Tops = [], Hard = [], Thick = [], Grad = [];
    let Elev = -1500.0, Guard = 0;
    while (Elev < 5000.0 && Guard++ < 4000)
    {
        const Draw = NextRand();
        const BedGroup = Draw < Packaging * 0.45 ? 0 : Draw < Packaging * 0.72 ? 1 : 2;
        const Count = 2 + Math.floor(NextRand() * 6.0);
        for (let Sub = 0; Sub < Count && Elev < 5000.0; Sub++)
        {
            let BedThick = Band * Math.exp(Gauss() * 0.5 * Variation) * (BedGroup === 0 ? 0.42 : BedGroup === 1 ? 1.45 : 1.0);
            BedThick = Math.max(Band * 0.12, Math.min(Band * 4.0, BedThick));
            let BedHard;
            if (BedGroup === 0)
                BedHard = NextRand() < 0.15 ? 0.62 + 0.30 * NextRand() : 0.02 + 0.24 * NextRand();
            else if (BedGroup === 1)
                BedHard = NextRand() < 0.18 ? 0.08 + 0.22 * NextRand() : 0.72 + 0.28 * NextRand();
            else
                BedHard = NextRand() < HardShare ? 0.66 + 0.34 * NextRand() : 0.03 + 0.27 * NextRand();
            Elev += BedThick;
            Tops.push(Elev);
            Hard.push(BedHard);
            Thick.push(BedThick);
            Grad.push(BedHard > 0.5 && NextRand() < 0.4 ? 1 : 0);
        }
    }
    return {
        Count: Tops.length,
        Band,
        Tops:  Float32Array.from(Tops),
        Hard:  Float32Array.from(Hard),
        Thick: Float32Array.from(Thick),
        Grad:  Uint8Array.from(Grad),
    };
}

export function SampleBedAt(Table, TiltedElev, Out)
{
    const Tops = Table.Tops;
    let Lo = 0, Hi = Table.Count - 1;
    while (Lo < Hi)
    {
        const Mid = (Lo + Hi) >> 1;
        if (TiltedElev < Tops[Mid]) Hi = Mid;
        else Lo = Mid + 1;
    }
    const Top = Tops[Lo], Thick = Table.Thick[Lo];
    Out.Index = Lo;
    Out.Frac  = Math.max(0.0, Math.min(1.0, (TiltedElev - (Top - Thick)) / Thick));
    Out.Thick = Thick;
    Out.Hard  = Table.Hard[Lo];
    Out.Grad  = Table.Grad[Lo];
    return Out;
}

export function BedJitter(WorldX, WorldZ, Amount = 0.22)
{
    const WaveA = Math.sin(WorldX * 0.0091 + 0.7 * Math.sin(WorldZ * 0.0063 + 1.3));
    const WaveB = Math.cos(WorldZ * 0.0077 + 0.5 * Math.sin(WorldX * 0.0052 + 0.4));
    return 1.0 + Amount * (0.6 * WaveA + 0.4 * WaveB);
}

export function ApplyStrataPackages(Field, Params, OutcropMask = null)
{
    const Heights  = Field.Heights;
    const Hardness = Field.ChannelSamples("Hardness");
    const N        = Resolution;
    const Band     = Math.max(2.0, Params.BandMetres || 24.0);
    const Strength = Params.TerraceStrength !== undefined ? Params.TerraceStrength : 0.72;
    const Contrast = Params.HardContrast !== undefined ? Params.HardContrast : 0.85;
    const DipDeg   = Params.Dip !== undefined ? Params.Dip : 4.0;
    const DirDeg   = Params.DipDirection !== undefined ? Params.DipDirection : 35.0;
    const Lateral  = Params.Lateral !== undefined ? Params.Lateral : 0.24;
    const Seed     = (Params.Seed || 1613) | 0;

    const DipRad = (DipDeg * Math.PI) / 180.0;
    const DirRad = (DirDeg * Math.PI) / 180.0;
    const DipGx  = Math.tan(DipRad) * Math.cos(DirRad);
    const DipGz  = Math.tan(DipRad) * Math.sin(DirRad);

    const DetailNoise = new SimplexNoise(Seed * 5 + 77);
    const Table       = ConstructBedTable({ BandMetres: Band, Variation: Params.Variation, Packaging: Params.Packaging, HardShare: Params.HardShare, Seed });
    const BedSample   = { Index: 0, Frac: 0.0, Thick: Band, Hard: 0.5, Grad: 0 };

    const SlopeMap = new Float32Array(N * N);
    for (let Z = 0; Z < N; Z++)
    {
        const Z0 = Math.max(0, Z - 1), Z1 = Math.min(N - 1, Z + 1);
        for (let X = 0; X < N; X++)
        {
            const X0 = Math.max(0, X - 1), X1 = Math.min(N - 1, X + 1);
            const Dx = (Heights[Z * N + X1] - Heights[Z * N + X0]) / ((X1 - X0) * TexelSize);
            const Dz = (Heights[Z1 * N + X] - Heights[Z0 * N + X]) / ((Z1 - Z0) * TexelSize);
            SlopeMap[Z * N + X] = Math.hypot(Dx, Dz);
        }
    }

    for (let Z = 0; Z < N; Z++)
    {
        const WorldZ = Z * TexelSize;
        for (let X = 0; X < N; X++)
        {
            const WorldX = X * TexelSize;
            const Idx    = Z * N + X;
            const H      = Heights[Idx];
            const Tilt   = DipGx * WorldX + DipGz * WorldZ;
            const Jitter = BedJitter(WorldX, WorldZ, Lateral);
            SampleBedAt(Table, (H + Tilt) / Jitter, BedSample);
            const Frac = BedSample.Frac;
            const Bi   = BedSample.Index;

            let Hard = BedSample.Grad ? BedSample.Hard * (0.55 + 0.45 * Frac) : BedSample.Hard;
            Hard = Math.min(1.0, Math.max(0.0, Hard + 0.12 * DetailNoise.Fbm(WorldX * 0.006 + Bi * 3.7, WorldZ * 0.006, 3)));
            Hard = 0.35 + (Hard - 0.35) * Contrast;

            const SteepK = 1.2 + 7.8 * Hard;
            const FracK  = Math.pow(Frac, SteepK);
            const StepF  = FracK / (FracK + Math.pow(1.0 - Frac, SteepK));
            const Thin   = SmoothStep01(0.08, 0.30, BedSample.Thick / Band);
            const Terraced = (Table.Tops[Bi] - BedSample.Thick + (Frac + (StepF - Frac) * Thin) * BedSample.Thick) * Jitter - Tilt;

            const SlopeMask = SmoothStep01(0.28, 0.78, SlopeMap[Idx]);
            const StrikeExpr = 0.55 + 0.45 * (0.5 + 0.5 * DetailNoise.Fbm(WorldX * 0.0045 + Bi * 1.9, WorldZ * 0.0045 - Bi * 0.7, 2));
            let Amount = Math.min(0.95, Strength * SlopeMask * (0.5 + 0.6 * Hard) * StrikeExpr);
            if (OutcropMask && OutcropMask[Idx] > 0.0)
                Amount *= (1.0 - OutcropMask[Idx]);

            Heights[Idx]  = H + (Terraced - H) * Amount;
            Hardness[Idx] = Math.max(Hardness[Idx] * 0.25, Hard);
        }
    }
}

//--------------------------------------------------------------------------------------------------------------------------------------------
//                                              SLATE RUGGED LATERAL PUSH-PULL CLIFFS (RUGGED.JS PORT)
//--------------------------------------------------------------------------------------------------------------------------------------------

function StairStep(Val, Steps, Sharp)
{
    const Scaled = Val * Steps;
    const Frac   = Scaled - Math.floor(Scaled);
    const Edge   = 0.5 - 0.5 * Sharp;
    return (Math.floor(Scaled) + SmoothStep01(Edge, 1.0 - Edge, Frac)) / Steps;
}

function BlockifySignal(Val, Steps, Sharp)
{
    const Norm = Math.min(1.0, Math.max(0.0, (Val + 1.0) * 0.5));
    return StairStep(Norm, Steps, Sharp) * 2.0 - 1.0;
}

export function RuggedPushPull(Field, Params)
{
    const Amount = Params.Amount !== undefined ? Params.Amount : 14.0;
    if (Amount <= 0.01)
        return;
    const Heights  = Field.Heights;
    const Hardness = Field.ChannelSamples("Hardness");
    const Snow     = Field.ChannelSamples("Snow");
    const N        = Resolution;
    const Total    = N * N;
    const ScaleL   = Math.max(TexelSize * 3.0, Params.Scale || 68.0);
    const Blocky   = Math.min(1.0, Math.max(0.0, Params.Blockiness !== undefined ? Params.Blockiness : 0.72));
    const Ledges   = Math.max(0.0, Params.Ledges !== undefined ? Params.Ledges : 0.52);
    const Bands    = Math.max(1, Math.round(Params.Bands || 3));
    const SlopeMin = Params.SlopeMin !== undefined ? Params.SlopeMin : 28.0;
    const SlopeMax = Params.SlopeMax !== undefined ? Params.SlopeMax : SlopeMin + 22.0;
    const TanMin   = Math.tan((SlopeMin * Math.PI) / 180.0);
    const TanMax   = Math.tan((SlopeMax * Math.PI) / 180.0);
    const Seed     = (Params.Seed || 1) | 0;

    const Noise2 = new SimplexNoise(Seed * 29 + 5);
    const Noise3 = new GradientNoise3(Seed * 31 + 17);

    let Mask = new Float32Array(Total);
    const GradX = new Float32Array(Total);
    const GradZ = new Float32Array(Total);
    for (let Z = 0; Z < N; Z++)
    {
        const Z0 = Math.max(0, Z - 1), Z1 = Math.min(N - 1, Z + 1);
        for (let X = 0; X < N; X++)
        {
            const X0 = Math.max(0, X - 1), X1 = Math.min(N - 1, X + 1);
            const Idx = Z * N + X;
            const Dx = (Heights[Z * N + X1] - Heights[Z * N + X0]) / ((X1 - X0) * TexelSize);
            const Dz = (Heights[Z1 * N + X] - Heights[Z0 * N + X]) / ((Z1 - Z0) * TexelSize);
            GradX[Idx] = Dx;
            GradZ[Idx] = Dz;
            Mask[Idx]  = SmoothStep01(TanMin, TanMax, Math.hypot(Dx, Dz));
        }
    }
    const BlurRad = Math.max(1, Math.min(16, Math.round(ScaleL * 0.22 / TexelSize)));
    Mask = BoxBlurInPlace(BoxBlurInPlace(Mask, BlurRad), BlurRad);

    const DispX = new Float32Array(Total);
    const DispZ = new Float32Array(Total);
    const DispY = new Float32Array(Total);
    for (let Z = 0; Z < N; Z++)
    {
        const WorldZ = (Z + 0.5) * TexelSize - WorldExtent * 0.5;
        for (let X = 0; X < N; X++)
        {
            const Idx = Z * N + X;
            const M = Mask[Idx];
            if (M < 0.01)
                continue;
            const WorldX = (X + 0.5) * TexelSize - WorldExtent * 0.5;
            const WorldY = Heights[Idx];
            let Coarse = Noise3.Fbm(WorldX / ScaleL, WorldY / (ScaleL * 0.55), WorldZ / ScaleL, 2, 2.1, 0.5) * 1.4;
            Coarse = (1.0 - Blocky) * Coarse + Blocky * BlockifySignal(Coarse, Bands, 0.75);
            let Fine = Noise2.Fbm(WorldX / (ScaleL * 0.33) + 7.3, WorldZ / (ScaleL * 0.33) - 2.1, 3, 2.2, 0.5) * 1.4;
            Fine = (1.0 - Blocky) * Fine + Blocky * BlockifySignal(Fine, 2, 0.70);
            const Signal = Coarse * 0.72 + Fine * 0.38;
            const GradLen = Math.hypot(GradX[Idx], GradZ[Idx]) || 1.0;
            const OutX = -GradX[Idx] / GradLen;
            const OutZ = -GradZ[Idx] / GradLen;
            const Shift = Amount * M * Signal;
            DispX[Idx] = OutX * Shift;
            DispZ[Idx] = OutZ * Shift;
            DispY[Idx] = Amount * Ledges * M * Signal * 0.35;
        }
    }
    const SmoothDx = BoxBlurInPlace(DispX, 1);
    const SmoothDz = BoxBlurInPlace(DispZ, 1);
    const SrcH     = new Float32Array(Heights);
    const SrcHard  = new Float32Array(Hardness);

    const SampleGrid = (Arr, Fx, Fz) =>
    {
        const X0 = Math.floor(Fx), Z0 = Math.floor(Fz);
        const Tx = Fx - X0, Tz = Fz - Z0;
        const X1 = Math.min(N - 1, X0 + 1), Z1 = Math.min(N - 1, Z0 + 1);
        const A = Arr[Z0 * N + X0], B = Arr[Z0 * N + X1], C = Arr[Z1 * N + X0], D = Arr[Z1 * N + X1];
        return (A * (1.0 - Tx) + B * Tx) * (1.0 - Tz) + (C * (1.0 - Tx) + D * Tx) * Tz;
    };

    for (let Z = 0; Z < N; Z++)
    {
        for (let X = 0; X < N; X++)
        {
            const Idx = Z * N + X;
            const Dx = SmoothDx[Idx], Dz = SmoothDz[Idx], Dy = DispY[Idx];
            if (Dx === 0.0 && Dz === 0.0 && Dy === 0.0)
                continue;
            const Fx = Math.min(N - 1.001, Math.max(0.0, X - Dx / TexelSize));
            const Fz = Math.min(N - 1.001, Math.max(0.0, Z - Dz / TexelSize));
            Heights[Idx]  = SampleGrid(SrcH, Fx, Fz) + Dy;
            Hardness[Idx] = Math.max(Hardness[Idx], SampleGrid(SrcHard, Fx, Fz));
            if (Math.abs(Dy) > 1.2)
                Snow[Idx] *= Math.max(0.0, 1.0 - Math.abs(Dy) * 0.18);
        }
    }
}

//--------------------------------------------------------------------------------------------------------------------------------------------
//                                              SLATE SUPERELLIPSOID BOULDER TORS (OUTCROPS.JS PORT)
//--------------------------------------------------------------------------------------------------------------------------------------------

export function AddBoulderTors(Field, Params)
{
    const Density = Math.min(1.0, Math.max(0.0, Params.Density !== undefined ? Params.Density : 0.45));
    const N = Resolution;
    const Mask = new Float32Array(N * N);
    if (Density <= 0.001)
        return Mask;

    const Heights    = Field.Heights;
    const Hardness   = Field.ChannelSamples("Hardness");
    const Deposition = Field.ChannelSamples("Deposition");
    const Snow       = Field.ChannelSamples("Snow");
    const Seed       = (Params.Seed || 1) | 0;
    const NextRand   = Mulberry32(Seed * 131 + 9);
    const BulgeNoise = new SimplexNoise(Seed * 7 + 3);
    const BaseH      = new Float32Array(Heights);

    const Radius     = Math.max(TexelSize * 2.0, Params.Size || 16.0);
    const Spacing    = Math.max(Radius * 3.0, Params.Spacing || 200.0);
    const PerCluster = Math.max(1, Math.round(Params.Count !== undefined ? Params.Count : 5));
    const Aspect     = Params.Aspect !== undefined ? Params.Aspect : 0.72;
    const Bury       = Math.min(1.0, Math.max(0.0, Params.Bury !== undefined ? Params.Bury : 0.38));
    const RidgeBias  = Math.min(1.0, Math.max(0.0, Params.RidgeBias !== undefined ? Params.RidgeBias : 0.55));
    const SlopeMax   = Math.tan(((Params.SlopeMax !== undefined ? Params.SlopeMax : 30.0) * Math.PI) / 180.0);
    const Weather    = Math.min(1.0, Math.max(0.0, Params.Weather !== undefined ? Params.Weather : 0.55));
    const Spread     = Params.Spread !== undefined ? Params.Spread : 1.55;

    const SampleBase = (Wx, Wz) =>
    {
        const U = Math.min(1.0, Math.max(0.0, Wx / WorldExtent)) * (N - 1);
        const W = Math.min(1.0, Math.max(0.0, Wz / WorldExtent)) * (N - 1);
        const I = Math.min(N - 2, Math.floor(U)), J = Math.min(N - 2, Math.floor(W));
        const Fu = U - I, Fw = W - J;
        const A = BaseH[J * N + I], B = BaseH[J * N + I + 1], C = BaseH[(J + 1) * N + I], D = BaseH[(J + 1) * N + I + 1];
        return (A * (1.0 - Fu) + B * Fu) * (1.0 - Fw) + (C * (1.0 - Fu) + D * Fu) * Fw;
    };
    const SlopeAtPos = (Wx, Wz, Rad) =>
    {
        const Dx = (SampleBase(Wx + Rad, Wz) - SampleBase(Wx - Rad, Wz)) / (2.0 * Rad);
        const Dz = (SampleBase(Wx, Wz + Rad) - SampleBase(Wx, Wz - Rad)) / (2.0 * Rad);
        return Math.hypot(Dx, Dz);
    };
    const ReliefAtPos = (Wx, Wz, Rad) =>
    {
        let Sum = 0.0;
        for (let K = 0; K < 8; K++)
        {
            const Ang = (K / 8.0) * Math.PI * 2.0;
            Sum += SampleBase(Wx + Math.cos(Ang) * Rad, Wz + Math.sin(Ang) * Rad);
        }
        return SampleBase(Wx, Wz) - Sum / 8.0;
    };

    const Boulders = [];
    const Margin = Radius * 2.0;
    const GridCount = Math.max(1, Math.floor(WorldExtent / Spacing));
    for (let Gj = 0; Gj < GridCount; Gj++)
    {
        for (let Gi = 0; Gi < GridCount; Gi++)
        {
            const R0 = NextRand(), R1 = NextRand(), R2 = NextRand(), R3 = NextRand();
            const Cx = Margin + ((Gi + 0.15 + R0 * 0.7) / GridCount) * (WorldExtent - 2.0 * Margin);
            const Cz = Margin + ((Gj + 0.15 + R1 * 0.7) / GridCount) * (WorldExtent - 2.0 * Margin);
            if (R2 > Density) continue;
            if (SlopeAtPos(Cx, Cz, Radius) > SlopeMax) continue;
            if (RidgeBias > 0.0)
            {
                const Rel = ReliefAtPos(Cx, Cz, Radius * 4.0);
                const Prob = (1.0 - RidgeBias) + RidgeBias * SmoothStep01(-Radius * 0.3, Radius * 0.8, Rel);
                if (R3 > Prob) continue;
            }
            const Count = Math.max(1, Math.round(PerCluster * (0.6 + NextRand() * 0.8)));
            const ClusterRad = Radius * Spread * Math.sqrt(Count) * 0.6;
            const Lean = NextRand() * Math.PI;
            for (let B = 0; B < Count; B++)
            {
                const Ang = NextRand() * Math.PI * 2.0;
                const Rad = B === 0 ? 0.0 : ClusterRad * Math.sqrt(NextRand());
                const Bx = Cx + Math.cos(Ang) * Rad, Bz = Cz + Math.sin(Ang) * Rad;
                if (SlopeAtPos(Bx, Bz, Radius * 0.5) > SlopeMax * 1.5) continue;
                const Scale = (B === 0 ? 1.0 : 0.45 + NextRand() * 0.6) * (0.8 + NextRand() * 0.4);
                const Rx = Radius * Scale * (0.8 + NextRand() * 0.5);
                const Rz = Radius * Scale * (0.6 + NextRand() * 0.5);
                const Ry = Math.max(Rx, Rz) * Aspect * (0.75 + NextRand() * 0.5);
                const Theta = Lean + (NextRand() - 0.5) * 0.9;
                const PowerP = 2.0 + (1.0 - Weather) * 1.4 + NextRand() * 0.4;
                const Ground = SampleBase(Bx, Bz);
                const Cy = Ground - Ry * Bury * (0.7 + NextRand() * 0.6);
                Boulders.push({ Bx, Bz, Rx, Rz, Ry, Cy, Cos: Math.cos(Theta), Sin: Math.sin(Theta), PowerP, SeedOff: NextRand() * 100.0 });
            }
        }
    }

    for (const Bd of Boulders)
    {
        const Reach = Math.max(Bd.Rx, Bd.Rz) * 1.25;
        const I0 = Math.max(0, Math.floor((Bd.Bx - Reach) / TexelSize));
        const I1 = Math.min(N - 1, Math.ceil((Bd.Bx + Reach) / TexelSize));
        const J0 = Math.max(0, Math.floor((Bd.Bz - Reach) / TexelSize));
        const J1 = Math.min(N - 1, Math.ceil((Bd.Bz + Reach) / TexelSize));
        const InvP = 1.0 / Bd.PowerP;
        for (let J = J0; J <= J1; J++)
        {
            const Dz = J * TexelSize - Bd.Bz;
            for (let I = I0; I <= I1; I++)
            {
                const Dx = I * TexelSize - Bd.Bx;
                const U = Dx * Bd.Cos + Dz * Bd.Sin;
                const W = -Dx * Bd.Sin + Dz * Bd.Cos;
                const Bulge = BulgeNoise.Fbm((U / Bd.Rx) * 1.3 + Bd.SeedOff, (W / Bd.Rz) * 1.3 - Bd.SeedOff, 2, 2.0, 0.5);
                const Grow = 1.0 + Bulge * 0.16 * (0.5 + Weather * 0.5);
                const Dist = Math.pow(Math.abs(U) / (Bd.Rx * Grow), Bd.PowerP) + Math.pow(Math.abs(W) / (Bd.Rz * Grow), Bd.PowerP);
                if (Dist >= 1.0)
                    continue;
                const Idx = J * N + I;
                const Top = Bd.Cy + Bd.Ry * Math.pow(1.0 - Dist, InvP) * (1.0 + Bulge * 0.06);
                if (Top > Heights[Idx])
                {
                    Heights[Idx] = Top;
                    const M = SmoothStep01(1.0, 0.72, Dist);
                    if (M > Mask[Idx]) Mask[Idx] = M;
                    Hardness[Idx] = Math.max(Hardness[Idx], 0.65 + 0.32 * M);
                    Deposition[Idx] *= (1.0 - 0.85 * M);
                    Snow[Idx] *= (1.0 - 0.75 * M);
                }
            }
        }
    }
    return Mask;
}

export function BakeSurfaceData(Field)
{
    const Heights = Field.Heights;
    const N = Resolution;
    const Occlusion  = Field.ChannelSamples("Occlusion");
    const Protrusion = Field.ChannelSamples("Protrusion");

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
            const Burial = 0.20 * Math.max(Near[Index] - H, 0.0) / 1.30
                         + 0.36 * Math.max(Mid[Index]  - H, 0.0) / 7.0
                         + 0.22 * Math.max(Far[Index]  - H, 0.0) / 26.0;
            const GradX = (Heights[Row + Math.min(X + 1, N - 1)] - Heights[Row + Math.max(X - 1, 0)]) / (2.0 * TexelSize);
            const GradY = (Heights[RowDown + X] - Heights[RowUp + X]) / (2.0 * TexelSize);
            const SkyFacing = 1.0 / Math.sqrt(1.0 + GradX * GradX + GradY * GradY);
            let Occ = (1.0 - Burial) * (0.52 + 0.48 * SkyFacing);
            Occlusion[Index] = Occ < 0.0 ? 0.0 : Occ > 1.0 ? 1.0 : Occ;
            const Pro = 0.66 * Math.max(H - Mid[Index], 0.0) / 6.0
                      + 0.32 * Math.max(H - Near[Index], 0.0) / 1.5;
            Protrusion[Index] = Pro > 1.0 ? 1.0 : Pro;
        }
    }
}
