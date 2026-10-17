//============================================================================================================================================
//                                                         RAYSCENERECORDS.WGSL
//============================================================================================================================================
// 🧩 GPU records for the explicit WebGPU triangle path tracer.  WebGPU's portable API has no acceleration-structure
//    object / ray-query stage, so this is a production two-level BVH (TLAS instances + SAH BLAS triangles) in storage.

struct RaySceneDescriptor
{
    TlasRoot         : u32,
    TlasNodeCount    : u32,
    SetCount         : u32,
    InstanceCount    : u32,
    MaximumBounces   : u32,
    SceneRevision    : u32,
    MaximumDistance  : f32,
    Pad              : f32,
}

struct RayNode
{
    Minimum     : vec3f,
    LeftOrFirst : u32,
    Maximum     : vec3f,
    Count       : u32, // 0 = interior; otherwise count from LeftOrFirst
}

struct RayTriangle
{
    A      : vec3f,
    Family : u32,
    B      : vec3f,
    PadB   : u32,
    C      : vec3f,
    PadC   : u32,
}

struct RayInstance
{
    BlasRoot : u32,
    Occupant : u32,
    Active   : u32,
    Pad      : u32,
}

// This is intentionally one shared group for direct shadows, ReSTIR candidates/reuse and glossy paths.  A change to
// a cone, wheel, prop or material therefore cannot make one lighting path see different geometry from another.
@group(1) @binding(0) var<uniform> RayScene                 : RaySceneDescriptor;
@group(1) @binding(1) var<storage, read> RayNodes           : array<RayNode>;
@group(1) @binding(2) var<storage, read> RayTriangles       : array<RayTriangle>;
@group(1) @binding(3) var<storage, read> RayInstances       : array<RayInstance>;
@group(1) @binding(4) var<storage, read> RayOccupants       : array<OccupantRecord>;
@group(1) @binding(5) var<storage, read> RayMaterials       : array<MaterialRecord>;
@group(1) @binding(6) var RaySkyView                        : texture_2d<f32>;
@group(1) @binding(7) var RaySkySampler                     : sampler;
@group(1) @binding(8) var<storage, read> RayLights          : array<LightRecord>;

const RaySkyIdentity : u32 = 2045u; // exactly representable in reservoir half identity storage
const RayBias : f32 = 0.003;
