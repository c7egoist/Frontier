//============================================================================================================================================
//                                                    CLUSTEREDLIGHTSTORE.JS
//============================================================================================================================================
// 🧩 Every light of the frame, binned into a world-space cluster grid and uploaded for the GPU: screen direct lighting, the surface
//    cache's direct pass (which the final gather and therefore every indirect bounce read) and the mirror / preview forward pass.

import { ProfileCount, ProfileTexels } from "./IesProfiles.js";

export const LightType = Object.freeze({ Point: 0, Spot: 1, Rect: 2 });
export const LightFlag = Object.freeze({ Shadow: 1 });

export const ClusterLimits = Object.freeze({
    MaxLights:    128,                                 // [-] lights per frame
    RecordFloats: 20,                                  // [-] 80 B per light record (ClusteredLights.wgsl: ClusteredLight)
    Minimum:      Object.freeze([-70.0, -70.0, -1.0]), // [m] the grid covers the proving grounds, the arena and the hangar
    Maximum:      Object.freeze([170.0, 70.0, 16.0]),  // [m]
    CellSize:     Object.freeze([5.0, 5.0, 8.5]),      // [m] two layers: the course below the car's roof, and above it
    MaxPerCell:   48,                                  // [-] lights kept per cell; later (less important) lights are dropped there
    MaxEntries:   32768                                // [-] total cell → light references per frame
});

const Dimensions = ClusterLimits.Minimum.map((Low, Axis) => Math.ceil((ClusterLimits.Maximum[Axis] - Low) / ClusterLimits.CellSize[Axis]));
export const ClusterDimensions = Object.freeze(Dimensions);
export const ClusterCount = Dimensions[0] * Dimensions[1] * Dimensions[2];
export const GridRecordBytes = 48;

// 📝 One light record. Position and reach; forward axis and type; up axis and IES profile (−1: none); linear colour × intensity
//    (for rectangles, radiance) and flags; the half extents of a rectangle. Forward and Up are unit and orthogonal.
export function MakeLight({ Type, Position, Forward, Up, Colour, Reach, Profile = -1, Shadow = false, HalfSize = [0, 0] })
{
    const F = Normalise(Forward);
    const U = Normalise(Subtract(Up, Scale(F, Dot(Up, F))));
    return { Type, Position: Position.slice(), Forward: F, Up: U, Colour: Colour.slice(), Reach, Profile,
             Shadow, HalfSize: HalfSize.slice() };
}

const Subtract = (A, B) => [A[0] - B[0], A[1] - B[1], A[2] - B[2]];
const Scale = (A, S) => [A[0] * S, A[1] * S, A[2] * S];
const Dot = (A, B) => A[0] * B[0] + A[1] * B[1] + A[2] * B[2];
function Normalise(V)
{
    const Length = Math.hypot(V[0], V[1], V[2]);
    if (!(Length > 1.0e-9))
        return [0, 0, -1];
    return [V[0] / Length, V[1] / Length, V[2] / Length];
}

// 📝 Packs one light into its 20 floats (the layout ClusteredLights.wgsl reads).
export function PackLight(Light)
{
    const Data = new Float32Array(ClusterLimits.RecordFloats);
    Data.set([...Light.Position, Light.Reach], 0);
    Data.set([...Light.Forward, Light.Type], 4);
    Data.set([...Light.Up, Light.Profile], 8);
    Data.set([...Light.Colour, Light.Shadow ? LightFlag.Shadow : 0], 12);
    Data.set([...Light.HalfSize, 0, 0], 16);
    return Data;
}

// 📝 The cell range a point falls in, or null beyond the grid. Shared by the CPU builder and by the tests.
export function ResolveCell(Position)
{
    const Index = [0, 1, 2].map((Axis) => Math.floor((Position[Axis] - ClusterLimits.Minimum[Axis]) / ClusterLimits.CellSize[Axis]));
    if (Index.some((Value, Axis) => Value < 0 || Value >= Dimensions[Axis]))
        return null;
    return Index[0] + Dimensions[0] * (Index[1] + Dimensions[1] * Index[2]);
}

// 📝 Bins the lights: each light's influence box (position ± reach) is walked cell by cell. Lists keep the order lights were
//    added in, so an earlier (more important) light is kept when a cell is full. Returns the CSR arrays and statistics.
export function BinLights(Lights)
{
    const Cells = Array.from({ length: ClusterCount }, () => []);
    let Dropped = 0;
    Lights.forEach((Light, Index) =>
    {
        const Reach = Light.Reach;
        const Low = [0, 1, 2].map((Axis) => Math.max(0, Math.floor((Light.Position[Axis] - Reach - ClusterLimits.Minimum[Axis]) / ClusterLimits.CellSize[Axis])));
        const High = [0, 1, 2].map((Axis) => Math.min(Dimensions[Axis] - 1, Math.floor((Light.Position[Axis] + Reach - ClusterLimits.Minimum[Axis]) / ClusterLimits.CellSize[Axis])));
        for (let Z = Low[2]; Z <= High[2]; ++Z)
            for (let Y = Low[1]; Y <= High[1]; ++Y)
                for (let X = Low[0]; X <= High[0]; ++X)
                {
                    const Cell = X + Dimensions[0] * (Y + Dimensions[1] * Z);
                    if (Cells[Cell].length < ClusterLimits.MaxPerCell)
                        Cells[Cell].push(Index);
                    else
                        ++Dropped;
                }
    });
    const Ranges = new Uint32Array(ClusterCount * 2);
    const Entries = [];
    let Used = 0, Busiest = 0, Overflow = 0;
    Cells.forEach((List, Cell) =>
    {
        Busiest = Math.max(Busiest, List.length);
        if (List.length > 0) Used++;
        const Room = Math.max(0, ClusterLimits.MaxEntries - Entries.length);
        const Kept = List.slice(0, Room);
        Overflow += List.length - Kept.length;
        Ranges[Cell * 2] = Entries.length;
        Ranges[Cell * 2 + 1] = Kept.length;
        for (const Index of Kept) Entries.push(Index);
    });
    return { Ranges, Entries: Uint32Array.from(Entries), Stats: { Cells: ClusterCount, CellsUsed: Used, BusiestCell: Busiest,
                                                                   Dropped: Dropped + Overflow, Entries: Entries.length } };
}

// 📝 The grid's uniform record: minimum and cell size (xyz), dimensions and the number of lights (w of the last row).
export function PackGrid(LightCount)
{
    const Data = new ArrayBuffer(GridRecordBytes);
    const Floats = new Float32Array(Data);
    const Integers = new Uint32Array(Data);
    Floats.set([...ClusterLimits.Minimum, 0.0], 0);
    Floats.set([...ClusterLimits.CellSize, 0.0], 4);
    Integers.set([...Dimensions, LightCount], 8);
    return Data;
}

//------------------------------------------------------------------------------------------------------------------------
//                                                     THE STORE
//------------------------------------------------------------------------------------------------------------------------

export class ClusteredLightStore
{
    constructor(Exchange)
    {
        this.Exchange = Exchange;
        this.Lights = [];
        this.Dropped = 0;
        this.Stats = { Lights: 0, Cells: ClusterCount, CellsUsed: 0, BusiestCell: 0, Dropped: 0, Entries: 0 };
        const Usage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;
        this.LightBuffer    = Exchange.ConstructRecords(ClusterLimits.MaxLights * ClusterLimits.RecordFloats * 4, Usage, "Clustered lights");
        this.CellBuffer     = Exchange.ConstructRecords(ClusterCount * 8, Usage, "Cluster cells");
        this.IndexBuffer    = Exchange.ConstructRecords(ClusterLimits.MaxEntries * 4, Usage, "Cluster indices");
        this.ProfileBuffer  = Exchange.ConstructRecords(ProfileCount * ProfileTexels * 4, Usage, "IES profiles");
        this.GridBuffer     = Exchange.ConstructRecords(GridRecordBytes, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, "Cluster grid");
        this.Layout = Exchange.ConstructDescriptorLayout(["StorageRead", "StorageRead", "StorageRead", "StorageRead", "Uniform"],
                                                         GPUShaderStage.COMPUTE | GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, "Clustered lights");
        this.Group = Exchange.ConstructDescriptorGroup(this.Layout, [this.LightBuffer, this.CellBuffer, this.IndexBuffer, this.ProfileBuffer, this.GridBuffer]);
        // 📝 Group 1 of programs that do not otherwise use one: an empty layout keeps the lights at group 2 in every program.
        this.EmptyLayout = Exchange.ConstructDescriptorLayout([], GPUShaderStage.COMPUTE | GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, "Lights (empty)");
        this.EmptyGroup = Exchange.ConstructDescriptorGroup(this.EmptyLayout, []);
        this.ProfileHash = "";
    }

    // 📝 The profile table: rebuilt and uploaded only when its content changes (the Lights page edits it live).
    AssignProfiles(Table)
    {
        const Hash = Table.reduce((Sum, Value, Index) => (Sum * 31 + Math.round(Value * 4096) + Index) % 2147483647, 7).toString(36);
        if (Hash === this.ProfileHash)
            return false;
        this.ProfileHash = Hash;
        this.Exchange.Device.queue.writeBuffer(this.ProfileBuffer, 0, Table);
        return true;
    }

    Begin()
    {
        this.Lights = [];
        this.Dropped = 0;
    }

    // 📝 Adds a light. Beyond MaxLights the light is dropped and counted: the lists are built in priority order.
    Add(Light)
    {
        if (this.Lights.length >= ClusterLimits.MaxLights)
        {
            this.Dropped++;
            return false;
        }
        this.Lights.push(Light);
        return true;
    }

    // 📝 Bins the lights and uploads the frame's light set. Called once a frame, before the frame record is written.
    Upload()
    {
        const Device = this.Exchange.Device;
        const Packed = new Float32Array(ClusterLimits.MaxLights * ClusterLimits.RecordFloats);
        this.Lights.forEach((Light, Index) => Packed.set(PackLight(Light), Index * ClusterLimits.RecordFloats));
        const Binned = BinLights(this.Lights);
        this.Stats = { ...Binned.Stats, Lights: this.Lights.length, Dropped: Binned.Stats.Dropped + this.Dropped };
        Device.queue.writeBuffer(this.LightBuffer, 0, Packed);
        Device.queue.writeBuffer(this.CellBuffer, 0, Binned.Ranges);
        if (Binned.Entries.length > 0)
            Device.queue.writeBuffer(this.IndexBuffer, 0, Binned.Entries);
        Device.queue.writeBuffer(this.GridBuffer, 0, PackGrid(this.Lights.length));
        return this.Stats;
    }
}
