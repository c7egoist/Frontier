//============================================================================================================================================
//                                                        RAYTRACINGGEOMETRY.JS
//============================================================================================================================================
// 🧩 Triangle acceleration data for the WebGPU ReSTIR path tracer.  WebGPU does not expose a portable hardware RT
//    pipeline, so RTX-class adapters execute this explicit two-level BVH in compute.  It is real triangle intersection
//    (not an SDF or screen-space proxy): BLASes are built per authored facet set and a refitted TLAS instances them.

import { ConstructBoundingStructure } from "./BoundingStructure.js";
import { OccupantRole } from "./FacetStructure.js";
import { FragmentTriangleBudget } from "./FractureStructure.js";

const NodeStride = 32;       // RayNode: min.xyz + left/first, max.xyz + count
const TriangleStride = 48;   // RayTriangle: three vec3/u32 records
const InstanceStride = 16;   // RayInstance
const DescriptorStride = 32; // RaySceneDescriptor

const EmptyMinimum = 1.0e20;
const EmptyMaximum = -1.0e20;

// Exported for the CPU checks and for offline scene-build tooling.  The existing SAH builder returns the facet order,
// which keeps the acceleration triangle stream and the authored material family exactly aligned.
export function ConstructRayBottomLevel(Facets)
{
    if (!Facets || Facets.length === 0)
        return { Nodes: new Float32Array(0), Triangles: new Float32Array(0), NodeCount: 0, TriangleCount: 0 };
    const Corners = new Float32Array(Facets.length * 9);
    Facets.forEach((Facet, Index) => Facet.Corners.forEach((Corner, CornerIndex) => Corners.set(Corner, Index * 9 + CornerIndex * 3)));
    const Structure = ConstructBoundingStructure(Corners);
    const TriangleBytes = new ArrayBuffer(Structure.FacetCount * TriangleStride);
    const TriangleScalars = new Float32Array(TriangleBytes);
    const TriangleIntegers = new Uint32Array(TriangleBytes);
    const Order = Structure.FacetOrder || Uint32Array.from({ length: Structure.FacetCount }, (_, Index) => Index);
    for (let Triangle = 0; Triangle < Structure.FacetCount; ++Triangle)
    {
        const Facet = Facets[Order[Triangle]];
        const Offset = Triangle * (TriangleStride / 4);
        TriangleScalars.set(Facet.Corners[0], Offset + 0);
        TriangleIntegers[Offset + 3] = Facet.Family >>> 0;
        TriangleScalars.set(Facet.Corners[1], Offset + 4);
        TriangleScalars.set(Facet.Corners[2], Offset + 8);
    }
    return { Nodes: Structure.NodeScalars, Triangles: TriangleScalars, NodeCount: Structure.NodeCount, TriangleCount: Structure.FacetCount };
}

// A balanced TLAS topology is stable for the lifetime of the exhibit; each frame only refits bounds.  Leaves retain a
// short contiguous instance range, so inactive stress slots and temporarily absent fracture pieces become empty leaves
// rather than causing CPU allocations or a topology rebuild in the render loop.
export function ConstructRayTopLevel(Scene, DynamicSlots = new Map())
{
    const Instances = [];
    Scene.Occupants.forEach((Occupant, Index) =>
    {
        const Set = Scene.FacetSets[Occupant.FacetSet];
        const StaticFacetSet = (Occupant.Roles & OccupantRole.Raster) && Set && Set.Facets.length > 0;
        // Fragments are rastered through one composite anchor draw, but each rigid piece needs its own ray instance.
        const DynamicFragment = Occupant.Fragment && DynamicSlots.has(Index);
        if (StaticFacetSet || DynamicFragment)
            Instances.push({ Occupant: Index, FacetSet: Occupant.FacetSet, DynamicFragment });
    });
    const Nodes = [];
    const Allocate = () => { Nodes.push({ Left: 0, First: 0, Count: 0, Indices: null }); return Nodes.length - 1; };
    // Keep sibling roots adjacent.  The shader can consequently derive the right child as left + 1 without paying a
    // second child pointer in every 32-byte node, matching the compact BLAS layout.
    const Build = (NodeIndex, List) =>
    {
        const Node = Nodes[NodeIndex];
        if (List.length <= 4)
        {
            Node.Indices = List.slice();
            Node.Count = List.length;
            return;
        }
        const Bounds = ResolveInstanceBounds(Scene, List, Instances);
        const Extent = Bounds.Maximum.map((Value, Axis) => Value - Bounds.Minimum[Axis]);
        const Axis = Extent.indexOf(Math.max(...Extent));
        List.sort((A, B) => ResolveCentroid(Scene, Instances[A], Axis) - ResolveCentroid(Scene, Instances[B], Axis));
        const Middle = List.length >> 1;
        const Left = Allocate();
        Allocate();
        Node.Left = Left;
        Build(Left, List.slice(0, Middle));
        Build(Left + 1, List.slice(Middle));
    };
    const Root = Instances.length ? Allocate() : 0;
    if (Instances.length)
        Build(Root, Instances.map((_, Index) => Index));
    // Flatten leaf ordering after the topology has been constructed.  Internal nodes retain absolute child indices.
    const LeafOrder = [];
    Nodes.forEach((Node) =>
    {
        if (!Node.Count)
            return;
        Node.First = LeafOrder.length;
        LeafOrder.push(...Node.Indices);
        Node.Indices = null;
    });
    const OrderedInstances = LeafOrder.map((Index) => Instances[Index]);
    return { Nodes, Instances: OrderedInstances, Root };
}

export class RayTracingGeometry
{
    constructor(Exchange, Shaders, Options = {})
    {
        this.Exchange = Exchange;
        this.Shaders = Shaders;
        this.MaximumBounces = Math.max(1, Math.min(6, Options.MaximumBounces || 3));
        this.MaximumDistance = Options.MaximumDistance || 500.0;
        this.SceneRevision = 1;
        this.Resources = [];
    }

    // The group is deliberately compute-only.  The primary raster pass stays the authoritative motion-vector producer;
    // all direct shadows, indirect paths, glossy paths and ReSTIR visibility rays use this exact same geometry group.
    async ConstructResources(Scene, OccupantRecords, MaterialRecords, SkyView, SkySampler, LightRecords)
    {
        this.Scene = Scene;
        const BottomLevels = Scene.FacetSets.map((Set) => ConstructRayBottomLevel(Set.Facets));
        const StaticNodeCount = BottomLevels.reduce((Total, Level) => Total + Level.NodeCount, 0);
        const StaticTriangleCount = BottomLevels.reduce((Total, Level) => Total + Level.TriangleCount, 0);
        // Every possible fracture piece receives an initially-empty BLAS leaf and a fixed triangle allotment.  Fracture
        // fills only the changed slot, so a real-time break never reallocates a bind group or drops exact ray shadows.
        this.DynamicSlots = new Map();
        Scene.Occupants.forEach((Occupant, Index) =>
        {
            if (Occupant.Fragment)
            {
                const Slot = this.DynamicSlots.size;
                this.DynamicSlots.set(Index, { BlasRoot: StaticNodeCount + Slot,
                                               FirstTriangle: StaticTriangleCount + Slot * FragmentTriangleBudget,
                                               TriangleCapacity: FragmentTriangleBudget });
            }
        });
        this.Tlas = ConstructRayTopLevel(Scene, this.DynamicSlots);
        const NodeCount = StaticNodeCount + this.DynamicSlots.size + this.Tlas.Nodes.length;
        const TriangleCount = StaticTriangleCount + this.DynamicSlots.size * FragmentTriangleBudget;
        const NodeBytes = new ArrayBuffer(Math.max(1, NodeCount) * NodeStride);
        const NodeScalars = new Float32Array(NodeBytes);
        const NodeIntegers = new Uint32Array(NodeBytes);
        const TriangleBytes = new ArrayBuffer(Math.max(1, TriangleCount) * TriangleStride);
        const TriangleScalars = new Float32Array(TriangleBytes);
        const SetData = new Uint32Array(Math.max(1, BottomLevels.length) * 4);
        let NodeBase = 0, TriangleBase = 0;
        BottomLevels.forEach((Level, SetIndex) =>
        {
            SetData[SetIndex * 4 + 0] = NodeBase;
            SetData[SetIndex * 4 + 1] = Level.NodeCount;
            SetData[SetIndex * 4 + 2] = TriangleBase;
            SetData[SetIndex * 4 + 3] = Level.TriangleCount;
            const LevelIntegers = new Uint32Array(Level.Nodes.buffer, Level.Nodes.byteOffset, Level.Nodes.length);
            for (let Node = 0; Node < Level.NodeCount; ++Node)
            {
                const Source = Node * 8, Target = (NodeBase + Node) * 8;
                NodeScalars.set(Level.Nodes.subarray(Source, Source + 8), Target);
                // Existing BLAS nodes name a local left child or local triangle first; ray traversal names global streams.
                const Count = LevelIntegers[Source + 7];
                NodeIntegers[Target + 3] = LevelIntegers[Source + 3] + (Count ? TriangleBase : NodeBase);
                NodeIntegers[Target + 7] = Count;
            }
            TriangleScalars.set(Level.Triangles, TriangleBase * (TriangleStride / 4));
            NodeBase += Level.NodeCount;
            TriangleBase += Level.TriangleCount;
        });
        this.DynamicNodeFirst = NodeBase;
        for (const Slot of this.DynamicSlots.values())
        {
            const Offset = Slot.BlasRoot * 8;
            NodeScalars.set([EmptyMinimum, EmptyMinimum, EmptyMinimum], Offset);
            NodeIntegers[Offset + 3] = Slot.FirstTriangle;
            NodeScalars.set([EmptyMaximum, EmptyMaximum, EmptyMaximum], Offset + 4);
            // A fixed-size leaf is safe because unused entries are degenerate triangles; its bounds remain empty until
            // a fracture writes real geometry into this slot.
            NodeIntegers[Offset + 7] = Slot.TriangleCapacity;
        }
        NodeBase += this.DynamicSlots.size;
        this.TlasNodeFirst = NodeBase;
        this.TlasRoot = this.TlasNodeFirst + this.Tlas.Root;
        this.NodeScalars = NodeScalars;
        this.NodeIntegers = NodeIntegers;
        this.SetRoots = Array.from({ length: Scene.FacetSets.length }, (_, Set) => SetData[Set * 4]);
        this.NodeRecords = this.Exchange.ConstructRecordsFrom(NodeScalars, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, "Ray BVH nodes");
        this.TriangleRecords = this.Exchange.ConstructRecordsFrom(TriangleScalars, GPUBufferUsage.STORAGE, "Ray triangles");
        this.InstanceRecords = this.Exchange.ConstructRecords(Math.max(1, this.Tlas.Instances.length) * InstanceStride,
                                                              GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, "Ray instances");
        this.DescriptorRecords = this.Exchange.ConstructRecords(DescriptorStride, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, "Ray scene descriptor");
        this.Resources.push(this.NodeRecords, this.TriangleRecords, this.InstanceRecords, this.DescriptorRecords);
        const Device = this.Exchange.Device;
        Device.pushErrorScope("validation");
        this.Layout = this.Exchange.ConstructDescriptorLayout(
            ["Uniform", "StorageRead", "StorageRead", "StorageRead", "StorageRead", "StorageRead", "Texture2D", "Sampler", "StorageRead"],
            GPUShaderStage.COMPUTE, "Triangle ray tracing scene");
        this.Group = this.Exchange.ConstructDescriptorGroup(this.Layout,
            [this.DescriptorRecords, this.NodeRecords, this.TriangleRecords, this.InstanceRecords, OccupantRecords,
             MaterialRecords, SkyView, SkySampler, LightRecords]);
        const Failure = await Device.popErrorScope();
        if (Failure)
            throw new Error(`Triangle ray tracing bind group — ${Failure.message}`);
        this.Update(Scene, true);
    }

    // Upload exact per-piece fracture geometry into its preallocated BLAS slot.  The fragment's rigid transform lives
    // in the normal OccupantRecord, so the triangle data stays fragment-local while physics moves it every frame.
    UpdateFragments(Pieces)
    {
        for (const Piece of Pieces)
        {
            const Slot = this.DynamicSlots.get(Piece.Occupant);
            if (!Slot || !Piece.Fragment)
                continue;
            const Bytes = new ArrayBuffer(Slot.TriangleCapacity * TriangleStride);
            const Scalars = new Float32Array(Bytes), Integers = new Uint32Array(Bytes);
            const Triangles = Piece.Fragment.Triangles.slice(0, Slot.TriangleCapacity);
            Triangles.forEach((Triangle, Index) =>
            {
                const Offset = Index * (TriangleStride / 4);
                Scalars.set(Triangle.Corners[0], Offset + 0);
                Integers[Offset + 3] = Triangle.Family >>> 0;
                Scalars.set(Triangle.Corners[1], Offset + 4);
                Scalars.set(Triangle.Corners[2], Offset + 8);
            });
            const NodeBytes = new ArrayBuffer(NodeStride);
            const NodeScalars = new Float32Array(NodeBytes), NodeIntegers = new Uint32Array(NodeBytes);
            NodeScalars.set(Piece.Fragment.Minimum, 0);
            NodeIntegers[3] = Slot.FirstTriangle;
            NodeScalars.set(Piece.Fragment.Maximum, 4);
            NodeIntegers[7] = Slot.TriangleCapacity;
            this.Exchange.Device.queue.writeBuffer(this.TriangleRecords, Slot.FirstTriangle * TriangleStride, Bytes);
            this.Exchange.Device.queue.writeBuffer(this.NodeRecords, Slot.BlasRoot * NodeStride, NodeBytes);
        }
        // A material/geometry replacement invalidates reservoir paths even if the instance happened to be active
        // already (for example, a rapid reassembly followed by a second impact).
        this.SceneRevision++;
    }

    // Refit leaf AABBs from the actual occupants, then union them upward.  Only the dynamic 32-byte-per-node region is
    // uploaded.  Geometry and BLASes never move; dynamic vehicle wheels, cones, props and stress instances do.
    Update(Scene, Force = false)
    {
        const NodeBounds = new Array(this.Tlas.Nodes.length);
        const InstanceData = new Uint32Array(Math.max(1, this.Tlas.Instances.length) * 4);
        let ActivityChanged = false;
        const Active = [];
        this.Tlas.Instances.forEach((Instance, Index) =>
        {
            const Occupant = Scene.Occupants[Instance.Occupant];
            const Enabled = Boolean(Occupant && !Occupant.Inactive && ((Occupant.Roles & OccupantRole.Raster) || Instance.DynamicFragment));
            Active[Index] = Enabled;
            if (this.PreviousActivity && this.PreviousActivity[Index] !== Enabled)
                ActivityChanged = true;
            const Dynamic = this.DynamicSlots.get(Instance.Occupant);
            InstanceData[Index * 4 + 0] = Dynamic ? Dynamic.BlasRoot : this.SetRoots[Instance.FacetSet];
            InstanceData[Index * 4 + 1] = Instance.Occupant;
            InstanceData[Index * 4 + 2] = Enabled ? 1 : 0;
        });
        this.PreviousActivity = Active;
        const Refit = (NodeIndex) =>
        {
            const Node = this.Tlas.Nodes[NodeIndex];
            if (Node.Count)
            {
                let Bounds = { Minimum: [EmptyMinimum, EmptyMinimum, EmptyMinimum], Maximum: [EmptyMaximum, EmptyMaximum, EmptyMaximum] };
                for (let Index = Node.First; Index < Node.First + Node.Count; ++Index)
                    if (Active[Index]) Bounds = UnionBounds(Bounds, Scene.QueryWorldBounds(this.Tlas.Instances[Index].Occupant));
                NodeBounds[NodeIndex] = Bounds;
                return Bounds;
            }
            const Bounds = UnionBounds(Refit(Node.Left), Refit(Node.Left + 1));
            NodeBounds[NodeIndex] = Bounds;
            return Bounds;
        };
        if (this.Tlas.Instances.length)
            Refit(this.Tlas.Root);
        const Bytes = new ArrayBuffer(Math.max(1, this.Tlas.Nodes.length) * NodeStride);
        const Scalars = new Float32Array(Bytes), Integers = new Uint32Array(Bytes);
        this.Tlas.Nodes.forEach((Node, Index) =>
        {
            const Bounds = NodeBounds[Index] || { Minimum: [EmptyMinimum, EmptyMinimum, EmptyMinimum], Maximum: [EmptyMaximum, EmptyMaximum, EmptyMaximum] };
            const Offset = Index * 8;
            Scalars.set(Bounds.Minimum, Offset);
            Integers[Offset + 3] = Node.Count ? Node.First : this.TlasNodeFirst + Node.Left;
            Scalars.set(Bounds.Maximum, Offset + 4);
            Integers[Offset + 7] = Node.Count;
        });
        if (ActivityChanged && !Force)
            this.SceneRevision++;
        const Descriptor = new ArrayBuffer(DescriptorStride);
        const DescriptorInts = new Uint32Array(Descriptor), DescriptorScalars = new Float32Array(Descriptor);
        DescriptorInts[0] = this.TlasRoot;
        DescriptorInts[1] = this.Tlas.Nodes.length;
        DescriptorInts[2] = Scene.FacetSets.length;
        DescriptorInts[3] = this.Tlas.Instances.length;
        DescriptorInts[4] = this.MaximumBounces;
        DescriptorInts[5] = this.SceneRevision;
        DescriptorScalars[6] = this.MaximumDistance;
        this.Exchange.Device.queue.writeBuffer(this.NodeRecords, this.TlasNodeFirst * NodeStride, Bytes);
        this.Exchange.Device.queue.writeBuffer(this.InstanceRecords, 0, InstanceData);
        this.Exchange.Device.queue.writeBuffer(this.DescriptorRecords, 0, Descriptor);
        return ActivityChanged;
    }
}

function ResolveCentroid(Scene, Instance, Axis)
{
    const Bounds = Scene.QueryWorldBounds(Instance.Occupant);
    return 0.5 * (Bounds.Minimum[Axis] + Bounds.Maximum[Axis]);
}

function ResolveInstanceBounds(Scene, Indices, Instances)
{
    let Bounds = { Minimum: [EmptyMinimum, EmptyMinimum, EmptyMinimum], Maximum: [EmptyMaximum, EmptyMaximum, EmptyMaximum] };
    for (const Index of Indices)
        Bounds = UnionBounds(Bounds, Scene.QueryWorldBounds(Instances[Index].Occupant));
    return Bounds;
}

function UnionBounds(A, B)
{
    return { Minimum: A.Minimum.map((Value, Axis) => Math.min(Value, B.Minimum[Axis])), Maximum: A.Maximum.map((Value, Axis) => Math.max(Value, B.Maximum[Axis])) };
}

export const RayTracingLayout = Object.freeze({ NodeStride, TriangleStride, InstanceStride, DescriptorStride });
