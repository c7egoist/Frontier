//============================================================================================================================================
//                                                      RAYRESTIRREFLECTION.WGSL
//============================================================================================================================================
// 🧩 Exact-triangle glossy path continuation.  This shares the ray scene and multi-bounce evaluator used by ReSTIR GI;
// it is not the former distance-field reflection approximation.

//! include "FrameDescriptor.wgsl"
//! include "PackingCodec.wgsl"
//! include "RayTraversal.wgsl"

@group(0) @binding(1) var<storage, read> Materials : array<MaterialRecord>;
@group(0) @binding(2) var SurfaceAttributes        : texture_2d<f32>;
@group(0) @binding(3) var SurfaceDepth             : texture_depth_2d;
@group(0) @binding(4) var ReflectionTarget         : texture_storage_2d<rgba16float, write>;

const RayReflectionRoughnessCutoff : f32 = 0.5;

@compute @workgroup_size(8, 8)
fn TraceRayReflection(@builtin(global_invocation_id) Invocation: vec3u)
{
    let TracePixel = Invocation.xy;
    if (any(vec2f(TracePixel) >= Frame.TraceExtent))
    {
        return;
    }
    let ScreenPixel = min(vec2i(TracePixel * Frame.TraceScale), vec2i(Frame.ScreenExtent) - vec2i(1));
    let Depth = textureLoad(SurfaceDepth, ScreenPixel, 0);
    if (Depth <= 0.0)
    {
        textureStore(ReflectionTarget, vec2i(TracePixel), vec4f(0.0));
        return;
    }
    let Attributes = textureLoad(SurfaceAttributes, ScreenPixel, 0);
    let Surface = ProjectSurfaceSample(Materials[u32(Attributes.z + 0.5)]);
    let Roughness = select(Surface.Roughness, Surface.CoatRoughness, Surface.CoatWeight > 0.0);
    if (Roughness > RayReflectionRoughnessCutoff)
    {
        textureStore(ReflectionTarget, vec2i(TracePixel), vec4f(0.0));
        return;
    }
    let Position = ReconstructWorldPosition(vec2f(ScreenPixel) + 0.5, Depth);
    let Normal = DecodeOctahedral(Attributes.xy);
    let View = normalize(Frame.CameraPosition - Position);
    var Seed = ConstructPixelSeed(TracePixel, Frame.FrameIndex, 109u);
    let Half = SampleGgxHalf(Normal, Roughness, vec2f(AdvanceUniform(&Seed), AdvanceUniform(&Seed)));
    var Direction = reflect(-View, Half);
    if (dot(Direction, Normal) <= 0.0)
    {
        Direction = reflect(-View, Normal);
    }
    let Hit = TraceRayClosest(Position + Normal * RayBias, Direction, RayBias, RayScene.MaximumDistance);
    let Radiance = TracePathRadiance(Hit, -Direction, &Seed);
    textureStore(ReflectionTarget, vec2i(TracePixel), vec4f(min(Radiance, vec3f(200.0)), 1.0));
}
