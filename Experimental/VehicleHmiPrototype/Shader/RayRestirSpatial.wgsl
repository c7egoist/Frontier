//============================================================================================================================================
//                                                        RAYRESTIRSPATIAL.WGSL
//============================================================================================================================================
// 🧩 ReSTIR GI spatial reuse for exact triangle paths: reconnection Jacobian, explicit 1/Z correction and ray-traced
//    visibility.  Donor radiance is re-evaluated from the receiver using its saved path seed/material before merging.

//! include "FrameDescriptor.wgsl"
//! include "RayTraversal.wgsl"
//! include "RayReservoirRecords.wgsl"

@group(0) @binding(1) var Guide                              : texture_2d<f32>;
@group(0) @binding(2) var SurfaceDepth                       : texture_depth_2d;
@group(0) @binding(3) var<storage, read> CurrentReservoirs  : array<RayReservoirRecord>;
@group(0) @binding(4) var IrradianceTarget                  : texture_storage_2d<rgba16float, write>;

const RayProposalCapacity : u32 = 8u;

fn ResolveRayTracePosition(TracePixel: vec2i) -> vec3f
{
    let ScreenPixel = min(TracePixel * i32(Frame.TraceScale), vec2i(Frame.ScreenExtent) - vec2i(1));
    return ReconstructWorldPosition(vec2f(ScreenPixel) + 0.5, textureLoad(SurfaceDepth, ScreenPixel, 0));
}

fn ResolveRayReconnectionJacobian(Sample: RayReservoirSample, Receiver: vec3f, Donor: vec3f) -> f32
{
    if (Sample.Identity == RaySkyIdentity)
    {
        return 1.0;
    }
    let ToDonor = Donor - Sample.Position;
    let ToReceiver = Receiver - Sample.Position;
    let DonorSquared = max(dot(ToDonor, ToDonor), 1.0e-6);
    let ReceiverSquared = max(dot(ToReceiver, ToReceiver), 1.0e-6);
    let CosineDonor = abs(dot(Sample.Normal, ToDonor)) * inverseSqrt(DonorSquared);
    let CosineReceiver = abs(dot(Sample.Normal, ToReceiver)) * inverseSqrt(ReceiverSquared);
    return (CosineReceiver / max(CosineDonor, 1.0e-4)) * (DonorSquared / ReceiverSquared);
}

fn RefreshSpatialRaySample(Sample: RayReservoirSample, Receiver: vec3f) -> RayReservoirSample
{
    var Result = Sample;
    if (Result.Identity == RaySkyIdentity)
    {
        Result.Radiance = SampleRaySky(-Result.Normal);
        return Result;
    }
    if (Result.Material >= arrayLength(&RayMaterials))
    {
        Result.Radiance = vec3f(0.0);
        return Result;
    }
    var Seed = Result.PathSeed;
    var Hit: RayHit;
    Hit.Position = Result.Position;
    Hit.Normal = Result.Normal;
    Hit.Distance = 0.0;
    Hit.Material = Result.Material;
    Hit.Occupant = Result.Identity;
    Hit.Hit = true;
    Result.Radiance = TracePathRadiance(Hit, normalize(Receiver - Result.Position), &Seed);
    return Result;
}

@compute @workgroup_size(8, 8)
fn ResampleRaySpatial(@builtin(global_invocation_id) Invocation: vec3u)
{
    let TracePixel = vec2i(Invocation.xy);
    let Extent = vec2i(Frame.TraceExtent);
    if (any(TracePixel >= Extent))
    {
        return;
    }
    let GuideTexel = textureLoad(Guide, TracePixel, 0);
    if (GuideTexel.w < 0.5)
    {
        textureStore(IrradianceTarget, TracePixel, vec4f(0.0));
        return;
    }
    let Normal = DecodeOctahedral(GuideTexel.xy);
    let ViewDepth = GuideTexel.z;
    let Position = ResolveRayTracePosition(TracePixel);
    var Seed = ConstructPixelSeed(vec2u(TracePixel), Frame.FrameIndex, 107u);
    let OwnStored = UnpackRayReservoir(CurrentReservoirs[u32(TracePixel.y * Extent.x + TracePixel.x)]);
    let OwnSample = RefreshSpatialRaySample(OwnStored.Sample, Position);
    var Spatial = ConstructEmptyRayReservoir();
    MergeRayReservoir(&Spatial, OwnSample, ResolveRayReservoirTarget(OwnSample, Position, Normal) * OwnStored.Weight * OwnStored.Tally,
                      OwnStored.Tally, AdvanceUniform(&Seed));

    var DonorPositions: array<vec3f, 8>;
    var DonorNormals: array<vec3f, 8>;
    var DonorTallies: array<f32, 8>;
    var DonorCount = 0u;
    if (FeatureEnabled(Frame, FeatureSpatialReuse))
    {
        let Count = min(Frame.SpatialCount, RayProposalCapacity);
        for (var Proposal = 0u; Proposal < Count; Proposal++)
        {
            let Offset = ProjectUniformDisk(vec2f(AdvanceUniform(&Seed), AdvanceUniform(&Seed))) * Frame.SpatialRadius;
            let Donor = clamp(TracePixel + vec2i(round(Offset)), vec2i(0), Extent - vec2i(1));
            if (all(Donor == TracePixel))
            {
                continue;
            }
            let DonorGuide = textureLoad(Guide, Donor, 0);
            let DonorNormal = DecodeOctahedral(DonorGuide.xy);
            if (DonorGuide.w < 0.5 || dot(DonorNormal, Normal) < 0.9 || abs(DonorGuide.z - ViewDepth) > 0.1 * ViewDepth)
            {
                continue;
            }
            let Reservoir = UnpackRayReservoir(CurrentReservoirs[u32(Donor.y * Extent.x + Donor.x)]);
            if (Reservoir.Tally <= 0.0 || Reservoir.Weight <= 0.0)
            {
                continue;
            }
            let DonorPosition = ResolveRayTracePosition(Donor);
            let Jacobian = ResolveRayReconnectionJacobian(Reservoir.Sample, Position, DonorPosition);
            if (Jacobian > 8.0 || Jacobian < 0.125 || Jacobian != Jacobian)
            {
                continue;
            }
            let Reconnected = RefreshSpatialRaySample(Reservoir.Sample, Position);
            let Target = ResolveRayReservoirTarget(Reconnected, Position, Normal);
            if (MergeRayReservoir(&Spatial, Reconnected, Target * Reservoir.Weight * Reservoir.Tally * Jacobian,
                                  Reservoir.Tally, AdvanceUniform(&Seed)))
            {
                Spatial.Adopted = true;
            }
            DonorPositions[DonorCount] = DonorPosition;
            DonorNormals[DonorCount] = DonorNormal;
            DonorTallies[DonorCount] = Reservoir.Tally;
            DonorCount++;
        }
    }
    if (Spatial.Adopted && FeatureEnabled(Frame, FeatureVisibilityReuse) && Spatial.Sample.Identity != RaySkyIdentity)
    {
        let Toward = Spatial.Sample.Position - Position;
        let Reach = length(Toward);
        if (TraceRayVisible(Position + Normal * RayBias, Toward / max(Reach, RayBias), Reach) < 0.5)
        {
            Spatial = ConstructEmptyRayReservoir();
            MergeRayReservoir(&Spatial, OwnSample, ResolveRayReservoirTarget(OwnSample, Position, Normal) * OwnStored.Weight * OwnStored.Tally,
                              OwnStored.Tally, AdvanceUniform(&Seed));
            DonorCount = 0u;
        }
    }
    let Chosen = Spatial.Sample;
    var Z = select(0.0, OwnStored.Tally, ResolveRayReservoirTarget(Chosen, Position, Normal) > 0.0);
    for (var Donor = 0u; Donor < DonorCount; Donor++)
    {
        if (ResolveRayReservoirTarget(Chosen, DonorPositions[Donor], DonorNormals[Donor]) > 0.0)
        {
            Z += DonorTallies[Donor];
        }
    }
    let Target = ResolveRayReservoirTarget(Chosen, Position, Normal);
    let Weight = select(0.0, Spatial.WeightSum / (Z * Target), Target > 0.0 && Z > 0.0);
    let Cosine = max(dot(Normal, ResolveRaySampleDirection(Chosen, Position)), 0.0);
    var Irradiance = Chosen.Radiance * Cosine * Weight;
    let Luminance = ResolveLuminance(Irradiance);
    let Limit = 40.0 * max(ResolveLuminance(Frame.SunIlluminance), 0.5);
    if (Luminance > Limit)
    {
        Irradiance *= Limit / Luminance;
    }
    textureStore(IrradianceTarget, TracePixel, vec4f(Irradiance, 1.0));
}
