//============================================================================================================================================
//                                                          RESAMPLINGSEQUENCE.JS
//============================================================================================================================================
// 🧩 ReSTIR GI over the exact WebGPU triangle scene: temporal candidates / path refresh, spatial reuse and glossy paths.
//    The old distance-field gather remains in the project for cards, smoke and inspection, but is not this renderer's
//    default transport path.

const ReservoirStride = 48;   // [B] - RayReservoirRecord (position/normal/radiance/path seed/material/W/M)

export class ResamplingSequence
{
    constructor(Exchange, Shaders)
    {
        this.Exchange = Exchange;
        this.Shaders = Shaders;
    }

    async ConstructPrograms(FrameRecords, MaterialRecords, RayTracing)
    {
        this.FrameRecords = FrameRecords;
        this.MaterialRecords = MaterialRecords;
        this.RayTracing = RayTracing;
        const Compute = GPUShaderStage.COMPUTE;
        this.TemporalLayout = this.Exchange.ConstructDescriptorLayout(
            ["Uniform", "Texture2D", "TextureDepth2D", "Texture2D", "Texture2D", "StorageTexture2D:rgba16float", "StorageRead", "Storage"],
            Compute, "Ray ReSTIR temporal");
        this.SpatialLayout = this.Exchange.ConstructDescriptorLayout(
            ["Uniform", "Texture2D", "TextureDepth2D", "StorageRead", "StorageTexture2D:rgba16float"], Compute, "Ray ReSTIR spatial");
        this.ReflectionLayout = this.Exchange.ConstructDescriptorLayout(
            ["Uniform", "StorageRead", "Texture2D", "TextureDepth2D", "StorageTexture2D:rgba16float"], Compute, "Ray reflection traversal");
        this.TemporalProgram = await this.Shaders.ConstructComputeProgram("RayRestirTemporal.wgsl", "ResampleRayTemporal",
                                                                            [this.TemporalLayout, RayTracing.Layout]);
        this.SpatialProgram = await this.Shaders.ConstructComputeProgram("RayRestirSpatial.wgsl", "ResampleRaySpatial",
                                                                           [this.SpatialLayout, RayTracing.Layout]);
        this.ReflectionProgram = await this.Shaders.ConstructComputeProgram("RayRestirReflection.wgsl", "TraceRayReflection",
                                                                              [this.ReflectionLayout, RayTracing.Layout]);
    }

    ConstructTargets(TraceExtent, Surface)
    {
        for (const Resource of this.Resources || [])
            Resource.destroy();
        const [Width, Height] = TraceExtent;
        const Usage = GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING;
        const Construct = (Label) => this.Exchange.ConstructTexture({ label: Label, size: TraceExtent, format: "rgba16float", usage: Usage });
        const Guides = [Construct("Ray ReSTIR guide A"), Construct("Ray ReSTIR guide B")];
        const Irradiance = Construct("Ray ReSTIR irradiance");
        const Reflection = Construct("Ray ReSTIR reflection radiance");
        const Reservoirs = [0, 1].map((Slot) => this.Exchange.ConstructRecords(Width * Height * ReservoirStride,
                                                                               GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, `Ray reservoirs ${Slot}`));
        this.Resources = [...Guides, Irradiance, Reflection, ...Reservoirs];
        this.TraceExtent = TraceExtent;
        this.Views = { Guides: Guides.map((Texture) => Texture.createView()), Irradiance: Irradiance.createView(), Reflection: Reflection.createView() };
        this.Reservoirs = Reservoirs;
        this.TemporalGroups = [0, 1].map((Parity) => this.Exchange.ConstructDescriptorGroup(this.TemporalLayout,
            [this.FrameRecords, Surface.Views.Attributes, Surface.Views.Depth, Surface.Views.Motion, this.Views.Guides[1 - Parity],
             this.Views.Guides[Parity], Reservoirs[1 - Parity], Reservoirs[Parity]]));
        this.SpatialGroups = [0, 1].map((Parity) => this.Exchange.ConstructDescriptorGroup(this.SpatialLayout,
            [this.FrameRecords, this.Views.Guides[Parity], Surface.Views.Depth, Reservoirs[Parity], this.Views.Irradiance]));
        this.ReflectionGroup = this.Exchange.ConstructDescriptorGroup(this.ReflectionLayout,
            [this.FrameRecords, this.MaterialRecords, Surface.Views.Attributes, Surface.Views.Depth, this.Views.Reflection]);
    }

    RecordResampling(Encoder, Parity, TimestampWrites)
    {
        const [Width, Height] = this.TraceExtent;
        const Pass = Encoder.beginComputePass({ label: "ReSTIR GI triangle paths", timestampWrites: TimestampWrites });
        Pass.setBindGroup(1, this.RayTracing.Group);
        Pass.setPipeline(this.TemporalProgram);
        Pass.setBindGroup(0, this.TemporalGroups[Parity]);
        Pass.dispatchWorkgroups(Math.ceil(Width / 8), Math.ceil(Height / 8));
        Pass.setPipeline(this.SpatialProgram);
        Pass.setBindGroup(0, this.SpatialGroups[Parity]);
        Pass.dispatchWorkgroups(Math.ceil(Width / 8), Math.ceil(Height / 8));
        Pass.end();
    }

    RecordReflection(Encoder, TimestampWrites)
    {
        const [Width, Height] = this.TraceExtent;
        const Pass = Encoder.beginComputePass({ label: "Triangle glossy paths", timestampWrites: TimestampWrites });
        Pass.setPipeline(this.ReflectionProgram);
        Pass.setBindGroup(0, this.ReflectionGroup);
        Pass.setBindGroup(1, this.RayTracing.Group);
        Pass.dispatchWorkgroups(Math.ceil(Width / 8), Math.ceil(Height / 8));
        Pass.end();
    }
}
