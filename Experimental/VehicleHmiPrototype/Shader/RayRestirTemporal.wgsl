//============================================================================================================================================
//                                                       RAYRESTIRTEMPORAL.WGSL
//============================================================================================================================================
// 🧩 Triangle-traced ReSTIR GI initial candidate + temporal reuse.  A raster primary hit supplies stable motion vectors;
// every secondary/continuation/shadow ray below intersects the exact scene BLAS/TLAS, not the legacy distance field.

//! include "FrameDescriptor.wgsl"
//! include "RayTraversal.wgsl"
//! include "RayReservoirRecords.wgsl"

@group(0) @binding(1) var SurfaceAttributes                     : texture_2d<f32>;
@group(0) @binding(2) var SurfaceDepth                          : texture_depth_2d;
@group(0) @binding(3) var SurfaceMotion                         : texture_2d<f32>;
@group(0) @binding(4) var PreviousGuide                         : texture_2d<f32>;
@group(0) @binding(5) var GuideTarget                           : texture_storage_2d<rgba16float, write>;
@group(0) @binding(6) var<storage, read> PreviousReservoirs    : array<RayReservoirRecord>;
@group(0) @binding(7) var<storage, read_write> CurrentReservoirs : array<RayReservoirRecord>;

fn ResolveRayScreenPixel(TracePixel: vec2u) -> vec2i
{
    return min(vec2i(TracePixel * Frame.TraceScale), vec2i(Frame.ScreenExtent) - vec2i(1));
}

fn CarryRayReservoirSample(Sample: RayReservoirSample) -> RayReservoirSample
{
    var Result = Sample;
    if (Sample.Identity < arrayLength(&RayOccupants))
    {
        let Occupant = RayOccupants[Sample.Identity];
        if ((Occupant.Roles & RoleDynamic) != 0u)
        {
            let LocalPosition = Occupant.PreviousWorldToLocal * vec4f(Sample.Position, 1.0);
            let LocalNormal = Occupant.PreviousWorldToLocal * vec4f(Sample.Normal, 0.0);
            Result.Position = (Occupant.LocalToWorld * LocalPosition).xyz;
            Result.Normal = normalize((Occupant.LocalToWorld * vec4f(LocalNormal.xyz, 0.0)).xyz);
        }
    }
    return Result;
}

// Re-evaluating uses a persistent seed stored in the reservoir.  The continuation random stream remains invariant while
// its camera-side vertex shifts, which is the prerequisite for unbiased target reweighting under temporal reuse.
fn RefreshRaySampleRadiance(Sample: RayReservoirSample, Receiver: vec3f) -> vec3f
{
    if (Sample.Identity == RaySkyIdentity)
    {
        return SampleRaySky(-Sample.Normal);
    }
    if (Sample.Identity >= arrayLength(&RayOccupants) || Sample.Material >= arrayLength(&RayMaterials))
    {
        return vec3f(0.0);
    }
    var Seed = Sample.PathSeed;
    // Material identity travels with the reservoir.  This avoids a heuristic normal probe and keeps per-facet paint,
    // tyre, rim and emissive families correct when a sample is reconnected to a new receiver.
    var Stored: RayHit;
    Stored.Position = Sample.Position;
    Stored.Normal = Sample.Normal;
    Stored.Distance = 0.0;
    Stored.Material = Sample.Material;
    Stored.Occupant = Sample.Identity;
    Stored.Hit = true;
    return TracePathRadiance(Stored, normalize(Receiver - Sample.Position), &Seed);
}

@compute @workgroup_size(8, 8)
fn ResampleRayTemporal(@builtin(global_invocation_id) Invocation: vec3u)
{
    let TracePixel = Invocation.xy;
    let Extent = vec2u(Frame.TraceExtent);
    if (any(TracePixel >= Extent))
    {
        return;
    }
    let Index = TracePixel.y * Extent.x + TracePixel.x;
    let ScreenPixel = ResolveRayScreenPixel(TracePixel);
    let Depth = textureLoad(SurfaceDepth, ScreenPixel, 0);
    if (Depth <= 0.0)
    {
        textureStore(GuideTarget, vec2i(TracePixel), vec4f(0.0));
        CurrentReservoirs[Index] = PackRayReservoir(ConstructEmptyRayReservoir());
        return;
    }
    let Position = ReconstructWorldPosition(vec2f(ScreenPixel) + 0.5, Depth);
    let Normal = DecodeOctahedral(textureLoad(SurfaceAttributes, ScreenPixel, 0).xy);
    let ViewDepth = ResolveViewDepth(Position);
    let ExpectedDepth = ResolvePriorViewDepth(Position);
    textureStore(GuideTarget, vec2i(TracePixel), vec4f(EncodeOctahedral(Normal), ViewDepth, 1.0 + ExpectedDepth));
    var Seed = ConstructPixelSeed(TracePixel, Frame.FrameIndex, 101u);

    // Initial candidate: cosine importance sample from the primary surface, then a complete NEE + multi-bounce path.
    let Direction = ConstructTangentFrame(Normal) * ProjectCosineHemisphere(ProjectTemporalPair(TracePixel, Frame.FrameIndex, 103u));
    let First = TraceRayClosest(Position + Normal * RayBias, Direction, RayBias, RayScene.MaximumDistance);
    var Candidate: RayReservoirSample;
    Candidate.PathSeed = PermuteUnsigned(Seed ^ 0x9e3779b9u);
    Candidate.Material = 0u;
    if (First.Hit)
    {
        Candidate.Position = First.Position;
        Candidate.Normal = First.Normal;
        Candidate.Identity = First.Occupant;
        Candidate.Material = First.Material;
        var PathSeed = Candidate.PathSeed;
        Candidate.Radiance = TracePathRadiance(First, -Direction, &PathSeed);
    }
    else
    {
        Candidate.Position = Position + Direction * RaySkyReach;
        Candidate.Normal = -Direction;
        Candidate.Identity = RaySkyIdentity;
        Candidate.Radiance = SampleRaySky(Direction);
    }
    let Cosine = max(dot(Normal, Direction), 0.0);
    let SourcePdf = Cosine * InversePi;
    var Current = ConstructEmptyRayReservoir();
    let InitialWeight = select(0.0, ResolveLuminance(Candidate.Radiance) * Cosine / SourcePdf, SourcePdf > 1.0e-6);
    MergeRayReservoir(&Current, Candidate, InitialWeight, 1.0, AdvanceUniform(&Seed));

    if (FeatureEnabled(Frame, FeatureTemporalReuse) && !FeatureEnabled(Frame, FeatureTemporalRestart))
    {
        let Motion = textureLoad(SurfaceMotion, ScreenPixel, 0).xy;
        let PriorScreen = vec2f(ScreenPixel) + 0.5 - Motion;
        let PriorTrace = vec2i(floor((PriorScreen - 0.5) / f32(Frame.TraceScale) + 0.5));
        if (all(PriorTrace >= vec2i(0)) && all(PriorTrace < vec2i(Extent)))
        {
            let PriorGuide = textureLoad(PreviousGuide, PriorTrace, 0);
            let PriorNormal = DecodeOctahedral(PriorGuide.xy);
            if (PriorGuide.w > 0.5 && dot(PriorNormal, Normal) > 0.85 && ClassifyPriorDepth(PriorGuide.z, ExpectedDepth, ViewDepth))
            {
                let Prior = UnpackRayReservoir(PreviousReservoirs[u32(PriorTrace.y) * Extent.x + u32(PriorTrace.x)]);
                if (Prior.Tally > 0.0 && Prior.Weight > 0.0)
                {
                    var Reused = CarryRayReservoirSample(Prior.Sample);
                    if (FeatureEnabled(Frame, FeatureRadianceRefresh))
                    {
                        Reused.Radiance = RefreshRaySampleRadiance(Reused, Position);
                    }
                    var Target = ResolveRayReservoirTarget(Reused, Position, Normal);
                    if (FeatureEnabled(Frame, FeatureVisibilityReuse) && Target > 0.0 && Reused.Identity != RaySkyIdentity)
                    {
                        let Toward = Reused.Position - Position;
                        let Reach = length(Toward);
                        Target *= TraceRayVisible(Position + Normal * RayBias, Toward / max(Reach, RayBias), Reach);
                    }
                    let Tally = min(Prior.Tally, Frame.TemporalTallyLimit);
                    MergeRayReservoir(&Current, Reused, Target * Prior.Weight * Tally, Tally, AdvanceUniform(&Seed));
                }
            }
        }
    }
    let Target = ResolveRayReservoirTarget(Current.Sample, Position, Normal);
    Current.Weight = select(0.0, Current.WeightSum / (Current.Tally * Target), Target > 0.0 && Current.Tally > 0.0);
    CurrentReservoirs[Index] = PackRayReservoir(Current);
}
