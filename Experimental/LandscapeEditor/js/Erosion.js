// 📦 Erosion operators — droplet hydraulics, stream power, talus, glacial, aeolian, wave-cut and stratified weathering.

import { CreateStream, LatticeHash } from "./Random.js";
import { RouteDrainage, AccumulateFlow, Gradient, Protrusion, DistanceTo } from "./Analysis.js";
import { SmoothStep } from "./Generators.js";

const Diagonal = Math.SQRT2;
const EightNeighbours = [
    [-1, 0, 1], [1, 0, 1], [0, -1, 1], [0, 1, 1],
    [-1, -1, Diagonal], [1, -1, Diagonal], [-1, 1, Diagonal], [1, 1, Diagonal],
];

/// in    Key      [-]  parameter identifier
/// in    Label    [-]  inspector caption
/// in    Unit     [-]  unit caption
/// in    Min      [-]  lower slider bound
/// in    Max      [-]  upper slider bound
/// in    Step     [-]  slider increment
/// in    Default  [-]  initial value
/// out   Param    [-]  schema record
function NumberParam(Key, Label, Unit, Min, Max, Step, Default) {
    return { Key, Label, Unit, Min, Max, Step, Default, Kind: "number" };
}

/// in    Heights   [m]    Float32Array N×N
/// in    N         [-]    grid edge length
/// in    X, Y      [-]    cell coordinates
/// in    Sample    [-]    Float32Array to read
/// out   Sample    [m]    bilinear sample at a fractional cell position
function Bilinear(Sample, N, X, Y) {
    const IX = Math.floor(X);
    const IY = Math.floor(Y);
    const FX = X - IX;
    const FY = Y - IY;
    const Index = IY * N + IX;
    return Sample[Index] * (1 - FX) * (1 - FY) + Sample[Index + 1] * FX * (1 - FY) + Sample[Index + N] * (1 - FX) * FY + Sample[Index + N + 1] * FX * FY;
}

/// in    Heights   [m]   Float32Array N×N, modified in place
/// in    N         [-]   grid edge length
/// in    Cell      [m]   cell edge length
/// in    Talus     [-]   per-cell tangent of the stable angle
/// in    Rate      [-]   fraction of excess moved per step, in (0, 1]
/// in    Donor     [-]   per-cell permission to move material, 0 locks the cell
/// out   Delta     [m]   Float32Array change to add to Heights; mass conserved
export function ThermalStep(Heights, N, Cell, Talus, Rate, Donor) {
    const Delta = new Float32Array(N * N);
    for (let Y = 0; Y < N; Y++) {
        for (let X = 0; X < N; X++) {
            const Index = Y * N + X;
            const Permission = Donor ? Donor[Index] : 1;
            if (Permission <= 0) {
                continue;
            }
            let Excess = 0;
            let Lowest = Heights[Index];
            for (const [DX, DY, Span] of EightNeighbours) {
                const NX = X + DX;
                const NY = Y + DY;
                if (NX < 0 || NY < 0 || NX >= N || NY >= N) {
                    continue;
                }
                const Other = NY * N + NX;
                Lowest = Math.min(Lowest, Heights[Other]);
                const Over = Heights[Index] - Heights[Other] - Talus[Index] * Span * Cell;
                if (Over > 0) {
                    Excess += Over;
                }
            }
            if (Excess <= 0) {
                continue;
            }
            const Outflow = Math.min(Rate * 0.5 * Excess * Permission, Math.max(Heights[Index] - Lowest, 0) * 0.5);
            const Share = Outflow / Excess;
            for (const [DX, DY, Span] of EightNeighbours) {
                const NX = X + DX;
                const NY = Y + DY;
                if (NX < 0 || NY < 0 || NX >= N || NY >= N) {
                    continue;
                }
                const Other = NY * N + NX;
                const Over = Heights[Index] - Heights[Other] - Talus[Index] * Span * Cell;
                if (Over <= 0) {
                    continue;
                }
                const Transfer = Over * Share;
                Delta[Index] -= Transfer;
                Delta[Other] += Transfer;
            }
        }
    }
    return Delta;
}

/// in    Radius   [cells]  erosion brush radius
/// out   Brush    [-]        { Offsets, Weights } radius-weighted erosion footprint, weights summing to one
function BuildBrush(Radius) {
    const Offsets = [];
    const Weights = [];
    let Total = 0;
    const R = Math.max(1, Math.round(Radius));
    for (let DY = -R; DY <= R; DY++) {
        for (let DX = -R; DX <= R; DX++) {
            const Distance = Math.hypot(DX, DY);
            if (Distance > R) {
                continue;
            }
            const Weight = R - Distance;
            Offsets.push(DY, DX);
            Weights.push(Weight);
            Total += Weight;
        }
    }
    for (let Index = 0; Index < Weights.length; Index++) {
        Weights[Index] /= Total;
    }
    return { Offsets, Weights };
}

/// in    Heights     [m]   Float32Array N×N, the working surface
/// in    Params      [-]   droplet coefficients
/// in    Ctx         [-]   { N, Cell, Erodibility, Seed }
/// out   Heights     [m]   same array, eroded in place
function HydraulicDroplets(Heights, Params, Ctx) {
    const { N, Cell, Erodibility, Seed } = Ctx;
    const Next = CreateStream(Seed);
    const Scale = (N / 256) * (N / 256);
    const Count = Math.round(Params.Droplets * Scale);
    const Brush = BuildBrush(Params.Radius);
    const Height = new Float32Array(N * N);
    for (let Index = 0; Index < Height.length; Index++) {
        Height[Index] = Heights[Index] / Cell;
    }
    const Inertia = Params.Inertia;
    const Gravity = Params.Gravity;
    const Evaporation = Params.Evaporation;
    for (let Drop = 0; Drop < Count; Drop++) {
        let PositionX = 1 + Next() * (N - 3);
        let PositionY = 1 + Next() * (N - 3);
        let DirectionX = 0;
        let DirectionY = 0;
        let Speed = 1;
        let Water = 1;
        let Sediment = 0;
        for (let Step = 0; Step < Params.Lifetime; Step++) {
            const IX = Math.floor(PositionX);
            const IY = Math.floor(PositionY);
            if (IX < 1 || IY < 1 || IX >= N - 2 || IY >= N - 2) {
                break;
            }
            const FX = PositionX - IX;
            const FY = PositionY - IY;
            const Index = IY * N + IX;
            const H00 = Height[Index];
            const H10 = Height[Index + 1];
            const H01 = Height[Index + N];
            const H11 = Height[Index + N + 1];
            const GradientX = (H10 - H00) * (1 - FY) + (H11 - H01) * FY;
            const GradientY = (H01 - H00) * (1 - FX) + (H11 - H10) * FX;
            const OldHeight = H00 * (1 - FX) * (1 - FY) + H10 * FX * (1 - FY) + H01 * (1 - FX) * FY + H11 * FX * FY;
            DirectionX = DirectionX * Inertia - GradientX * (1 - Inertia);
            DirectionY = DirectionY * Inertia - GradientY * (1 - Inertia);
            const Length = Math.hypot(DirectionX, DirectionY);
            if (Length < 1e-6) {
                const Angle = Next() * Math.PI * 2;
                DirectionX = Math.cos(Angle);
                DirectionY = Math.sin(Angle);
            } else {
                DirectionX /= Length;
                DirectionY /= Length;
            }
            PositionX += DirectionX;
            PositionY += DirectionY;
            if (PositionX < 1 || PositionY < 1 || PositionX >= N - 2 || PositionY >= N - 2) {
                break;
            }
            const NewHeight = Bilinear(Height, N, PositionX, PositionY);
            const DeltaHeight = NewHeight - OldHeight;
            const Capacity = Math.max(-DeltaHeight * Speed * Water * Params.Capacity, Params.MinSlope);
            const Here = Erodibility[Index];
            if (Sediment > Capacity || DeltaHeight > 0) {
                const Amount = DeltaHeight > 0 ? Math.min(DeltaHeight, Sediment) : (Sediment - Capacity) * Params.DepositRate;
                Sediment -= Amount;
                Height[Index] += Amount * (1 - FX) * (1 - FY);
                Height[Index + 1] += Amount * FX * (1 - FY);
                Height[Index + N] += Amount * (1 - FX) * FY;
                Height[Index + N + 1] += Amount * FX * FY;
            } else {
                const Amount = Math.min((Capacity - Sediment) * Params.ErodeRate * Here, -DeltaHeight);
                for (let Entry = 0; Entry < Brush.Weights.length; Entry++) {
                    const Target = (IY + Brush.Offsets[Entry * 2]) * N + (IX + Brush.Offsets[Entry * 2 + 1]);
                    if (Target < 0 || Target >= N * N) {
                        continue;
                    }
                    const Removed = Math.min(Amount * Brush.Weights[Entry], Math.max(Height[Target], 0));
                    Height[Target] -= Removed;
                    Sediment += Removed;
                }
            }
            Speed = Math.sqrt(Math.max(Speed * Speed + DeltaHeight * Gravity, 0));
            Water *= 1 - Evaporation;
        }
    }
    for (let Index = 0; Index < Height.length; Index++) {
        Heights[Index] = Height[Index] * Cell;
    }
    return Heights;
}

/// in    Heights     [m]   Float32Array N×N, the working surface
/// in    Params      [-]   stream-power coefficients
/// in    Ctx         [-]   { N, Cell, Sea, Erodibility }
/// out   Heights     [m]   same array, incised and aggraded in place
function StreamPower(Heights, Params, Ctx) {
    const { N, Cell, Sea, Erodibility } = Ctx;
    const Total = N * N;
    for (let Iteration = 0; Iteration < Params.Iterations; Iteration++) {
        const Routing = RouteDrainage(Heights, N, Sea);
        const Area = AccumulateFlow(Routing, N);
        const { Receiver, Order, Count } = Routing;
        const Load = new Float32Array(Total);
        for (let Step = Count - 1; Step >= 0; Step--) {
            const Index = Order[Step];
            const Down = Receiver[Index];
            const Drainage = Math.pow(Area[Index] / Total, Params.AreaExponent);
            if (Down === Index) {
                Load[Index] = 0;
                continue;
            }
            const DX = Math.abs((Down % N) - (Index % N));
            const DY = Math.abs(Math.floor(Down / N) - Math.floor(Index / N));
            const Span = DX + DY === 2 ? Cell * Diagonal : Cell;
            const Drop = Heights[Index] - Heights[Down];
            const Slope = Math.max(Drop, 0) / Span;
            const Power = Math.pow(Slope, Params.SlopeExponent);
            const Potential = Params.Erodibility * 60 * Drainage * Power * Erodibility[Index];
            const Eroded = Math.max(Math.min(Potential, Math.max(Drop, 0) * 0.5), 0);
            Heights[Index] -= Eroded;
            let Carried = Load[Index] + Eroded;
            const Capacity = Params.Transport * Potential;
            if (Carried > Capacity) {
                const Deposit = (Carried - Capacity) * Params.Deposition;
                Heights[Index] += Deposit;
                Carried -= Deposit;
            }
            Load[Down] += Carried;
        }
    }
    return Heights;
}

/// in    Heights     [m]   Float32Array N×N, the working surface
/// in    Params      [-]   talus coefficients
/// in    Ctx         [-]   { N, Cell, Erodibility }
/// out   Heights     [m]   same array after talus relaxation
function Talus(Heights, Params, Ctx) {
    const { N, Cell, Erodibility } = Ctx;
    const Tangent = Math.tan((Params.Angle * Math.PI) / 180);
    const Limit = new Float32Array(N * N).fill(Tangent);
    for (let Iteration = 0; Iteration < Params.Iterations; Iteration++) {
        const Delta = ThermalStep(Heights, N, Cell, Limit, Params.Rate, Erodibility);
        for (let Index = 0; Index < Heights.length; Index++) {
            Heights[Index] += Delta[Index];
        }
    }
    return Heights;
}

/// in    Heights     [m]   Float32Array N×N, the working surface
/// in    Params      [-]   glacial coefficients
/// in    Ctx         [-]   { N, Cell, Sea, Erodibility }
/// out   Heights     [m]   same array, carved into U-shaped valleys in place
function Glacial(Heights, Params, Ctx) {
    const { N, Cell, Sea, Erodibility } = Ctx;
    const Total = N * N;
    for (let Iteration = 0; Iteration < Params.Iterations; Iteration++) {
        const Routing = RouteDrainage(Heights, N, Sea);
        const { Receiver, Order, Count } = Routing;
        const Snowfall = new Float32Array(Total);
        for (let Index = 0; Index < Total; Index++) {
            Snowfall[Index] = Math.min(Math.max((Heights[Index] - Params.Snowline + 400) / 1200, 0), 1);
        }
        const Flux = new Float32Array(Snowfall);
        for (let Step = Count - 1; Step >= 0; Step--) {
            const Index = Order[Step];
            const Down = Receiver[Index];
            if (Down !== Index) {
                Flux[Down] += Flux[Index];
            }
        }
        let Peak = 1e-6;
        for (let Index = 0; Index < Total; Index++) {
            Peak = Math.max(Peak, Flux[Index]);
        }
        const Curvature = Protrusion(Heights, N, Cell);
        for (let Index = 0; Index < Total; Index++) {
            const Normalised = Flux[Index] / Peak;
            const Ice = SmoothStep(Params.IceThreshold, 1, Math.sqrt(Normalised)) * Erodibility[Index];
            const Concave = Math.max(-Curvature[Index], 0);
            const Cirque = Params.Cirque * Concave * SmoothStep(Params.Snowline - 900, Params.Snowline, Heights[Index]) * 4;
            Heights[Index] -= Params.Strength * 30 * Ice * Math.sqrt(Normalised) + Cirque * Params.Strength * 6;
        }
        for (let Pass = 0; Pass < Params.Smoothing; Pass++) {
            const Copy = new Float32Array(Heights);
            for (let Y = 1; Y < N - 1; Y++) {
                for (let X = 1; X < N - 1; X++) {
                    const Index = Y * N + X;
                    const Average = (Copy[Index - 1] + Copy[Index + 1] + Copy[Index - N] + Copy[Index + N]) * 0.25;
                    Heights[Index] += (Average - Copy[Index]) * 0.35 * Erodibility[Index];
                }
            }
        }
    }
    return Heights;
}

/// in    Heights     [m]   Float32Array N×N, the working surface
/// in    Params      [-]   aeolian coefficients
/// in    Ctx         [-]   { N, Cell, Erodibility }
/// out   Heights     [m]   same array, deflated on windward faces and drifted onto lee faces
function Aeolian(Heights, Params, Ctx) {
    const { N, Cell, Erodibility } = Ctx;
    const Total = N * N;
    const Angle = (Params.WindAngle * Math.PI) / 180;
    const UX = Math.cos(Angle);
    const UY = Math.sin(Angle);
    const Sand = new Float32Array(Total);
    const Repose = Math.tan((Params.Repose * Math.PI) / 180);
    const Rock = Math.tan((70 * Math.PI) / 180);
    const Donor = new Float32Array(Total);
    for (let Iteration = 0; Iteration < Params.Iterations; Iteration++) {
        const { Gx, Gy } = Gradient(Heights, N, Cell);
        const Flux = new Float32Array(Total);
        for (let Index = 0; Index < Total; Index++) {
            const Along = Gx[Index] * UX + Gy[Index] * UY;
            const Windward = Math.max(Along, 0);
            const Lee = Math.max(-Along, 0);
            const Cover = Math.min(Sand[Index] / 0.6, 1);
            const Deflation = Params.Strength * Erodibility[Index] * Windward * Cell * 0.08 * (1 - Cover);
            Heights[Index] -= Deflation;
            Flux[Index] = Deflation * (1 + Params.SandSupply * 0.4);
            Sand[Index] = Math.max(Sand[Index] - Deflation, 0);
            Donor[Index] = Lee > 0 ? Lee : 0;
        }
        const Shifted = new Float32Array(Total);
        const Reach = Params.Saltation;
        for (let Y = 0; Y < N; Y++) {
            for (let X = 0; X < N; X++) {
                const SX = X - UX * Reach;
                const SY = Y - UY * Reach;
                if (SX < 0 || SY < 0 || SX > N - 1 || SY > N - 1) {
                    continue;
                }
                Shifted[Y * N + X] = Bilinear(Flux, N, SX, SY);
            }
        }
        for (let Index = 0; Index < Total; Index++) {
            const Sheltered = SmoothStep(0.0, 0.25, Donor[Index]);
            const Fraction = 0.05 + 0.85 * Sheltered;
            const Deposit = Shifted[Index] * Fraction * Params.SandSupply;
            Heights[Index] += Deposit;
            Sand[Index] += Deposit;
        }
        const Limit = new Float32Array(Total);
        const Lock = new Float32Array(Total);
        for (let Index = 0; Index < Total; Index++) {
            const Loose = SmoothStep(0.05, 0.3, Sand[Index]);
            Limit[Index] = Repose * Loose + Rock * (1 - Loose);
            Lock[Index] = Loose;
        }
        const Delta = ThermalStep(Heights, N, Cell, Limit, 0.5, Lock);
        for (let Index = 0; Index < Total; Index++) {
            Heights[Index] += Delta[Index];
            Sand[Index] = Math.max(Sand[Index] + Delta[Index] * 0.5, 0);
        }
    }
    return Heights;
}

/// in    Heights     [m]   Float32Array N×N, the working surface
/// in    Params      [-]   wave-cut coefficients
/// in    Ctx         [-]   { N, Cell, Sea, Erodibility }
/// out   Heights     [m]   same array with notched cliff bases and talus at the foot
function WaveCut(Heights, Params, Ctx) {
    const { N, Cell, Sea, Erodibility } = Ctx;
    const Total = N * N;
    const SeaMask = new Uint8Array(Total);
    const LandMask = new Uint8Array(Total);
    for (let Index = 0; Index < Total; Index++) {
        SeaMask[Index] = Heights[Index] <= Sea ? 1 : 0;
        LandMask[Index] = 1 - SeaMask[Index];
    }
    const ToSea = DistanceTo(SeaMask, N, Cell);
    const Exposure = new Float32Array(Total);
    const MaximumFetch = 40;
    for (let Y = 0; Y < N; Y++) {
        for (let X = 0; X < N; X++) {
            const Index = Y * N + X;
            if (!LandMask[Index] || ToSea[Index] > Cell * 3) {
                continue;
            }
            let Fetch = 0;
            for (const [DX, DY] of EightNeighbours) {
                let Steps = 0;
                let CX = X;
                let CY = Y;
                while (Steps < MaximumFetch) {
                    CX += DX;
                    CY += DY;
                    if (CX < 0 || CY < 0 || CX >= N || CY >= N || !SeaMask[CY * N + CX]) {
                        break;
                    }
                    Steps++;
                }
                Fetch += Steps / MaximumFetch;
            }
            Exposure[Index] = Fetch / EightNeighbours.length;
        }
    }
    const Band = Math.max(Params.Reach / 2, Cell);
    for (let Iteration = 0; Iteration < Params.Iterations; Iteration++) {
        for (let Index = 0; Index < Total; Index++) {
            if (!LandMask[Index] || Exposure[Index] <= 0) {
                continue;
            }
            const Elevation = Heights[Index] - Sea;
            const Band01 = Math.exp(-(Elevation * Elevation) / (2 * Band * Band));
            const Attack = Params.Energy * Exposure[Index] * Band01 * Erodibility[Index];
            const Undercut = Attack * Cell * (0.25 + 0.75 * Params.Undercut);
            Heights[Index] -= Undercut;
        }
        const Limit = new Float32Array(Total).fill(Math.tan((Params.Talus * Math.PI) / 180));
        const Rock = new Float32Array(Total);
        for (let Index = 0; Index < Total; Index++) {
            const Near = LandMask[Index] && ToSea[Index] < Params.Reach * 2 ? 1 : 0;
            Rock[Index] = Near;
        }
        const Delta = ThermalStep(Heights, N, Cell, Limit, 0.4, Rock);
        for (let Index = 0; Index < Total; Index++) {
            Heights[Index] += Delta[Index];
        }
    }
    return Heights;
}

/// in    Heights     [m]   Float32Array N×N, the working surface; also the stratigraphic reference
/// in    Params      [-]   weathering coefficients
/// in    Ctx         [-]   { N, Cell, Erodibility, Seed }
/// out   Heights     [m]   same array with soft beds receding faster and hard beds forming caprock steps
function Stratified(Heights, Params, Ctx) {
    const { N, Cell, Erodibility, Seed } = Ctx;
    const Total = N * N;
    const Hardness = new Float32Array(Total);
    for (let Index = 0; Index < Total; Index++) {
        const Bed = Math.floor(Heights[Index] / Math.max(Params.BandHeight, 1));
        const Roll = LatticeHash(Seed, Bed, 7, 3);
        const Hard = Roll < Params.HardRatio ? 1 : 1 - Params.Contrast;
        Hardness[Index] = Hard;
    }
    const Tangent = new Float32Array(Total);
    for (let Index = 0; Index < Total; Index++) {
        Tangent[Index] = Math.tan(((Params.Talus * (0.45 + 0.55 * Hardness[Index])) * Math.PI) / 180);
    }
    for (let Iteration = 0; Iteration < Params.Iterations; Iteration++) {
        const { Gx, Gy } = Gradient(Heights, N, Cell);
        for (let Index = 0; Index < Total; Index++) {
            const Slope = Math.hypot(Gx[Index], Gy[Index]);
            const Soft = (1 - Hardness[Index]) * Erodibility[Index];
            Heights[Index] -= Params.Rate * Soft * Math.min(Slope, 1.2) * Cell * 0.9;
        }
        const Delta = ThermalStep(Heights, N, Cell, Tangent, 0.45, null);
        for (let Index = 0; Index < Total; Index++) {
            Heights[Index] += Delta[Index];
        }
    }
    return Heights;
}

/// in    Type     [-]  catalogue key
/// in    Spec     [-]  parameter record
/// in    Ctx      [-]  { N, Cell, Sea, World, Heights, Erodibility, Seed }
/// out   Eroded   [m]  Float32Array of new heights; the pipeline blends it by mask weight
export function ApplyErosion(Type, Params, Ctx) {
    const Heights = new Float32Array(Ctx.Heights);
    const Erodibility = Ctx.Erodibility ?? new Float32Array(Heights.length).fill(1);
    const Full = { ...Ctx, Erodibility, Heights };
    switch (Type) {
        case "Hydraulic":
            return HydraulicDroplets(Heights, Params, Full);
        case "StreamPower":
            return StreamPower(Heights, Params, Full);
        case "Thermal":
            return Talus(Heights, Params, Full);
        case "Glacial":
            return Glacial(Heights, Params, Full);
        case "Aeolian":
            return Aeolian(Heights, Params, Full);
        case "WaveCut":
            return WaveCut(Heights, Params, Full);
        case "Stratified":
            return Stratified(Heights, Params, Full);
        default:
            return Heights;
    }
}

/// Each entry lists its name, group, summary and parameter schema with units and ranges.
export const ErosionCatalogue = {
    Hydraulic: {
        Name: "Hydraulic droplets",
        Group: "Fluvial",
        Summary: "Particle erosion: droplets roll downhill, pick up sediment where they accelerate and drop it on flats. Carves gullies, alluvial fans and realistic branching valleys.",
        Params: [
            NumberParam("Droplets", "Droplet count", "per 256²", 5000, 400000, 1000, 90000),
            NumberParam("Lifetime", "Droplet lifetime", "steps", 10, 200, 1, 70),
            NumberParam("Inertia", "Inertia", "", 0, 0.5, 0.01, 0.08),
            NumberParam("Capacity", "Sediment capacity", "×", 0.5, 12, 0.1, 4),
            NumberParam("MinSlope", "Minimum slope", "", 0, 0.1, 0.001, 0.02),
            NumberParam("ErodeRate", "Erode rate", "", 0.02, 1, 0.01, 0.35),
            NumberParam("DepositRate", "Deposit rate", "", 0.02, 1, 0.01, 0.25),
            NumberParam("Evaporation", "Evaporation", "", 0, 0.1, 0.001, 0.02),
            NumberParam("Gravity", "Gravity", "×", 1, 20, 0.5, 4),
            NumberParam("Radius", "Erosion radius", "cells", 1, 6, 1, 3),
        ],
    },
    StreamPower: {
        Name: "Stream power (fluvial)",
        Group: "Fluvial",
        Summary: "Drainage-routed incision E = K·A^m·S^n with transport-limited deposition. Builds coherent river networks and terraces.",
        Params: [
            NumberParam("Erodibility", "Erodibility K", "", 0, 3, 0.01, 0.8),
            NumberParam("AreaExponent", "Area exponent m", "", 0.2, 0.8, 0.01, 0.45),
            NumberParam("SlopeExponent", "Slope exponent n", "", 0.6, 1.4, 0.01, 1.0),
            NumberParam("Transport", "Transport capacity", "×", 0.2, 3, 0.05, 1.2),
            NumberParam("Deposition", "Deposition fraction", "", 0, 1, 0.01, 0.35),
            NumberParam("Iterations", "Iterations", "", 1, 40, 1, 10),
        ],
    },
    Thermal: {
        Name: "Thermal talus",
        Group: "Mass wasting",
        Summary: "Slopes steeper than the talus angle shed material downhill until they settle at the angle of repose. Gives scree aprons and rounded shoulders.",
        Params: [
            NumberParam("Angle", "Talus angle", "deg", 10, 70, 0.5, 38),
            NumberParam("Rate", "Transfer rate", "", 0.05, 0.5, 0.01, 0.3),
            NumberParam("Iterations", "Iterations", "", 1, 120, 1, 25),
        ],
    },
    Glacial: {
        Name: "Glacial carving",
        Group: "Cryogenic",
        Summary: "Snowfall above the snowline feeds ice that follows drainage. Thick flow cuts U-shaped troughs, cirques and widened floors.",
        Params: [
            NumberParam("Snowline", "Snowline", "m", 0, 6000, 10, 2400),
            NumberParam("Strength", "Ice strength", "×", 0, 3, 0.01, 1),
            NumberParam("IceThreshold", "Ice threshold", "", 0, 0.9, 0.01, 0.2),
            NumberParam("Cirque", "Cirque headwalls", "", 0, 1, 0.01, 0.4),
            NumberParam("Smoothing", "Valley widening", "passes", 0, 12, 1, 4),
            NumberParam("Iterations", "Iterations", "", 1, 10, 1, 3),
        ],
    },
    Aeolian: {
        Name: "Aeolian wind",
        Group: "Desert",
        Summary: "Wind deflates windward rock and drifts sand to lee faces. Sand piles relax to the angle of repose, forming dunes with slip faces.",
        Params: [
            NumberParam("WindAngle", "Wind direction", "deg", 0, 359, 1, 35),
            NumberParam("Strength", "Deflation strength", "", 0, 1, 0.01, 0.5),
            NumberParam("SandSupply", "Sand supply", "", 0, 1, 0.01, 0.6),
            NumberParam("Saltation", "Saltation length", "cells", 1, 10, 0.5, 3),
            NumberParam("Repose", "Angle of repose", "deg", 20, 40, 0.5, 33),
            NumberParam("Iterations", "Iterations", "", 1, 80, 1, 30),
        ],
    },
    WaveCut: {
        Name: "Wave-cut coast",
        Group: "Coastal",
        Summary: "Wave energy scaled by sea-fetch exposure attacks the band around sea level. Notches undercut cliffs and the collapse leaves talus at the foot.",
        Params: [
            NumberParam("Reach", "Wave reach", "m", 5, 400, 5, 90),
            NumberParam("Energy", "Wave energy", "", 0, 1, 0.01, 0.6),
            NumberParam("Undercut", "Undercut", "", 0, 1, 0.01, 0.5),
            NumberParam("Talus", "Foot talus angle", "deg", 20, 75, 0.5, 55),
            NumberParam("Iterations", "Iterations", "", 1, 60, 1, 18),
        ],
    },
    Stratified: {
        Name: "Stratified weathering",
        Group: "Differential",
        Summary: "Horizontal beds of alternating hardness erode at different rates. Hard caprock holds steep faces, soft beds recede — stepped canyon and mesa walls.",
        Params: [
            NumberParam("BandHeight", "Bed thickness", "m", 20, 600, 5, 120),
            NumberParam("HardRatio", "Hard bed share", "", 0, 1, 0.01, 0.45),
            NumberParam("Contrast", "Hardness contrast", "", 0, 1, 0.01, 0.8),
            NumberParam("Rate", "Weathering rate", "", 0, 1, 0.01, 0.35),
            NumberParam("Talus", "Soft-bed talus", "deg", 20, 70, 0.5, 42),
            NumberParam("Iterations", "Iterations", "", 1, 80, 1, 25),
        ],
    },
};

/// in    Type     [-]  catalogue key
/// out   Params   [-]  object of default values
export function DefaultErosionParams(Type) {
    const Descriptor = ErosionCatalogue[Type] ?? ErosionCatalogue.Hydraulic;
    const Result = {};
    for (const Param of Descriptor.Params) {
        Result[Param.Key] = Param.Default;
    }
    return Result;
}

