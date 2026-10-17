//============================================================================================================================================
//                                                       RAYDIRECTRADIANCE.WGSL
//============================================================================================================================================
// 🧩 Primary-surface direct radiance with exact BVH shadow rays.  The surface raster remains the primary visibility /
// motion-vector pass; every sun, streetlight and headlight shadow is traced against the same triangle scene as ReSTIR.

//! include "FrameDescriptor.wgsl"
//! include "SurfaceReflectance.wgsl"
//! include "PackingCodec.wgsl"
//! include "SkyProjection.wgsl"
//! include "ClusteredLights.wgsl"
//! include "RayTraversal.wgsl"

@group(0) @binding(1) var<storage, read> Materials     : array<MaterialRecord>;
@group(0) @binding(2) var SurfaceAttributes             : texture_2d<f32>;
@group(0) @binding(3) var SurfaceDepth                  : texture_depth_2d;
@group(0) @binding(4) var ShadowDepthUnused             : texture_depth_2d_array;
@group(0) @binding(5) var ShadowSamplerUnused           : sampler_comparison;
@group(0) @binding(6) var<uniform> ShadowReceiverUnused : array<vec4f, 14>;
@group(0) @binding(7) var SkyViewUnused                 : texture_2d<f32>;
@group(0) @binding(8) var SkySamplerUnused              : sampler;
@group(0) @binding(9) var DirectTarget                  : texture_storage_2d<rgba16float, write>;
@group(0) @binding(10) var<storage, read> SceneLightsUnused : array<LightRecord>;

fn ResolveRayBackgroundRadiance(Direction: vec3f) -> vec3f
{
    return SampleRaySky(Direction);
}

fn ResolveRayFire(Position: vec3f, Normal: vec3f, View: vec3f, Surface: SurfaceSample) -> vec3f
{
    if (Frame.FireLightIntensity <= 0.0)
    {
        return vec3f(0.0);
    }
    let Toward = Frame.FireLightPosition - Position;
    let DistanceSquared = dot(Toward, Toward);
    if (DistanceSquared >= Frame.FireLightReach * Frame.FireLightReach)
    {
        return vec3f(0.0);
    }
    let Distance = sqrt(DistanceSquared);
    let Direction = Toward / max(Distance, 1.0e-4);
    let Ratio = DistanceSquared / (Frame.FireLightReach * Frame.FireLightReach);
    let Window = (1.0 - Ratio * Ratio) * (1.0 - Ratio * Ratio);
    let Visibility = select(1.0, TraceRayVisible(Position + Normal * RayBias, Direction, max(RayBias, Distance - 0.3)),
                            FeatureEnabled(Frame, FeatureDirectShadow));
    let Arrival = Frame.FireLightColour * Frame.FireLightIntensity * Window * Visibility / max(DistanceSquared, 0.25);
    return Arrival * ResolveDirectReflectance(Surface, Normal, View, Direction);
}

@compute @workgroup_size(8, 8)
fn IntegrateRayDirectRadiance(@builtin(global_invocation_id) Invocation: vec3u)
{
    let Pixel = Invocation.xy;
    if (any(vec2f(Pixel) >= Frame.ScreenExtent))
    {
        return;
    }
    let Depth = textureLoad(SurfaceDepth, vec2i(Pixel), 0);
    let Centre = vec2f(Pixel) + 0.5;
    if (Depth <= 0.0)
    {
        let Far = ReconstructWorldPosition(Centre, 1.0e-6);
        textureStore(DirectTarget, vec2i(Pixel), vec4f(ResolveRayBackgroundRadiance(normalize(Far - Frame.CameraPosition)), 0.0));
        return;
    }
    let Position = ReconstructWorldPosition(Centre, Depth);
    let Attributes = textureLoad(SurfaceAttributes, vec2i(Pixel), 0);
    let Normal = DecodeOctahedral(Attributes.xy);
    let Surface = ProjectSurfaceSample(Materials[u32(Attributes.z + 0.5)]);
    let View = normalize(Frame.CameraPosition - Position);
    var Radiance = RayDirectLighting(Position, Normal, View, Surface);
    Radiance += ResolveRayFire(Position, Normal, View, Surface);
    textureStore(DirectTarget, vec2i(Pixel), vec4f(Radiance, 1.0));
}
