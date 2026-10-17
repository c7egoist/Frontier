//============================================================================================================================================
//                                                       RAYRESERVOIRRECORDS.WGSL
//============================================================================================================================================
// 🧩 ReSTIR GI reservoir records for exact triangle paths.  In addition to x_s/n_s/L/W/M, every sample retains its
//    random path seed: temporal and spatial reuse re-evaluate the *same* continuation path from the shifted receiver
//    rather than borrowing stale card-cache radiance.

//! include "PackingCodec.wgsl"

struct RayReservoirRecord
{
    SamplePosition : vec3f,
    SampleNormal   : u32,
    Radiance       : vec2u,
    PathSeed       : u32,
    Material       : u32,
    Weight         : f32,
    Tally          : f32,
    Pad            : vec2u,
}

struct RayReservoirSample
{
    Position    : vec3f,
    Normal      : vec3f,
    Radiance    : vec3f,
    Identity    : u32,
    PathSeed    : u32,
    Material    : u32,
}

struct RayReservoir
{
    Sample    : RayReservoirSample,
    WeightSum : f32,
    Tally     : f32,
    Weight    : f32,
    Adopted   : bool,
}

const RaySkyReach : f32 = 10000.0;

fn ConstructEmptyRayReservoir() -> RayReservoir
{
    var Result: RayReservoir;
    Result.Sample.Position = vec3f(0.0);
    Result.Sample.Normal = vec3f(0.0, 0.0, 1.0);
    Result.Sample.Radiance = vec3f(0.0);
    Result.Sample.Identity = RaySkyIdentity;
    Result.Sample.PathSeed = 0u;
    Result.Sample.Material = 0u;
    Result.WeightSum = 0.0;
    Result.Tally = 0.0;
    Result.Weight = 0.0;
    Result.Adopted = false;
    return Result;
}

fn PackRayReservoir(Source: RayReservoir) -> RayReservoirRecord
{
    var Result: RayReservoirRecord;
    Result.SamplePosition = Source.Sample.Position;
    Result.SampleNormal = PackOctahedral(Source.Sample.Normal);
    Result.Radiance = PackHalfTriple(min(Source.Sample.Radiance, vec3f(60000.0)), f32(Source.Sample.Identity));
    Result.PathSeed = Source.Sample.PathSeed;
    Result.Material = Source.Sample.Material;
    Result.Weight = Source.Weight;
    Result.Tally = Source.Tally;
    Result.Pad = vec2u(0u);
    return Result;
}

fn UnpackRayReservoir(Source: RayReservoirRecord) -> RayReservoir
{
    var Result = ConstructEmptyRayReservoir();
    let Packed = UnpackHalfTriple(Source.Radiance);
    Result.Sample.Position = Source.SamplePosition;
    Result.Sample.Normal = UnpackOctahedral(Source.SampleNormal);
    Result.Sample.Radiance = Packed.rgb;
    Result.Sample.Identity = u32(Packed.w + 0.5);
    Result.Sample.PathSeed = Source.PathSeed;
    Result.Sample.Material = Source.Material;
    Result.Weight = Source.Weight;
    Result.Tally = Source.Tally;
    return Result;
}

fn MergeRayReservoir(Target: ptr<function, RayReservoir>, Candidate: RayReservoirSample, Weight: f32, Tally: f32, Random: f32) -> bool
{
    (*Target).WeightSum += Weight;
    (*Target).Tally += Tally;
    if (Weight > 0.0 && Random * (*Target).WeightSum < Weight)
    {
        (*Target).Sample = Candidate;
        return true;
    }
    return false;
}

fn ResolveRaySampleDirection(Sample: RayReservoirSample, Position: vec3f) -> vec3f
{
    return normalize(Sample.Position - Position);
}

fn ResolveRayReservoirTarget(Sample: RayReservoirSample, Position: vec3f, Normal: vec3f) -> f32
{
    let Cosine = dot(Normal, ResolveRaySampleDirection(Sample, Position));
    return select(0.0, ResolveLuminance(Sample.Radiance) * Cosine, Cosine > 0.0);
}
