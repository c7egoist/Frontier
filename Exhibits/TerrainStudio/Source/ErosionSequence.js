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
    const Lifetime         = 26;
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

            const Capacity = Math.max(CapacityFactor * Speed * Water * -DeltaHeight, MinimumCapacity);

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
                let Amount = Math.min((Capacity - Sediment) * ErodeRate, -DeltaHeight > 0.0 ? -DeltaHeight : 0.0);
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
                let Lowest       = Height;
                let LowestIndex  = Index;
                const Left  = Heights[Index - 1];
                const Right = Heights[Index + 1];
                const Up    = Heights[Index - N];
                const Down  = Heights[Index + N];
                if (Left  < Lowest) { Lowest = Left;  LowestIndex = Index - 1; }
                if (Right < Lowest) { Lowest = Right; LowestIndex = Index + 1; }
                if (Up    < Lowest) { Lowest = Up;    LowestIndex = Index - N; }
                if (Down  < Lowest) { Lowest = Down;  LowestIndex = Index + N; }
                const Drop = Height - Lowest;
                const CellLimit = Limit + (CliffLimit - Limit) * HardnessNorm[Index];
                if (Drop > CellLimit)
                {
                    const Move = (Drop - CellLimit) * Rate;
                    Delta[Index]       -= Move;
                    Delta[LowestIndex] += Move;
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
    while (HeapSize > 0)
    {
        const Cell = HeapPop();
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

    //📝 Kahn upstream order: cells with no donors first. Accumulation rides the same order that the
    //   incision pass will reuse to deliver sediment downstream.
    const Order = new Int32Array(Count);
    const Queue = new Int32Array(Count);
    let QueueHead = 0;
    let QueueTail = 0;
    for (let Cell = 0; Cell < Count; Cell++)
    {
        if (Donors[Cell] === 0)
            Queue[QueueTail++] = Cell;
    }
    const Accumulation = new Float32Array(Count).fill(1.0);
    let Ordered = 0;
    while (QueueHead < QueueTail)
    {
        const Cell = Queue[QueueHead++];
        Order[Ordered++] = Cell;
        const Target = Receiver[Cell];
        if (Target >= 0)
        {
            Accumulation[Target] += Accumulation[Cell];
            if (--Donors[Target] === 0)
                Queue[QueueTail++] = Target;
        }
        if ((Ordered & 65535) === 0)
        {
            Report(0.65 + 0.35 * Ordered / Count);
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
    const DepositShare = 0.32;
    const AreaExponent = 0.45;
    const Iterations   = Math.max(1, Math.round(Params.Iterations));
    const Applied = new Float32Array(Heights.length);
    const Carve   = new Float32Array(Heights.length);

    for (let Iteration = 0; Iteration < Iterations; Iteration++)
    {
        Applied.fill(0.0);
        Carve.fill(0.0);
        for (let OrderIndex = 0; OrderIndex < Ordered; OrderIndex++)
        {
            const Cell   = Order[OrderIndex];
            const Target = Receiver[Cell];
            if (Target < 0)
                continue;
            const AreaNorm = Accumulation[Cell] / MaxAccumulation;
            if (AreaNorm < 0.0004)
                continue;
            const CellX = Cell % N;
            const CellZ = (Cell / N) | 0;
            const TargetX = Target % N;
            const TargetZ = (Target / N) | 0;
            const StepMetres = Math.sqrt((CellX - TargetX) * (CellX - TargetX) + (CellZ - TargetZ) * (CellZ - TargetZ)) * TexelSize;
            const SlopeHere = Math.max((Heights[Cell] - Heights[Target]) / StepMetres, 0.0);
            const Resistance = 1.0 - 0.8 * Hardness[Cell];
            // The (0.12 + S) floor stands in for base-level fall: a trunk stream saws downward even
            // where its local grade is gentle — that is how a river crosses a plateau at all.
            let Incision = Strength * Math.pow(AreaNorm, AreaExponent) * (0.12 + Math.min(SlopeHere, 1.4)) * Resistance * 60.0;
            if (Incision > 14.0) Incision = 14.0;
            if (Incision <= 0.0)
                continue;
            Applied[Cell] = Incision;
            Heights[Target] += Incision * DepositShare;
            Deposition[Target] = Math.min(Deposition[Target] + Incision * 0.08, 1.0);
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
            const GradX = (Heights[Z * N + X1] - Heights[Z * N + X0]) / ((X1 - X0) * TexelSize);
            const GradZ = (Heights[Z1 * N + X] - Heights[Z0 * N + X]) / ((Z1 - Z0) * TexelSize);
            const SlopeHere = Math.sqrt(GradX * GradX + GradZ * GradZ);
            let Hold = 1.0 - Math.min(SlopeHere / (SlopeLimit * 1.9), 1.0);
            Hold = Hold * Hold;
            const Stored = Cover * (0.25 + 0.75 * Hold);
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
