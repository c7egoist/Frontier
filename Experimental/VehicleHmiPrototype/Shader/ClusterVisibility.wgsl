//============================================================================================================================================
//                                                       CLUSTERVISIBILITY.WGSL
//============================================================================================================================================
// 🧩 The shadowing of the clustered lights through the scene distance field, for the programs that have it (the direct pass and the
//    surface cache's direct pass). Lights that do not cast shadows, and frames with shadows off, are unshadowed.

//! include "FrameDescriptor.wgsl"
//! include "DistanceTraversal.wgsl"
//! include "ClusteredLights.wgsl"

// 📝 The share of a sample's light that reaches the point: a penumbra traversal that stops short of the light, so a lamp's own
//    housing does not shadow the light it emits.
fn ResolveSampleVisibility(Sample: LightSample, Position: vec3f, Normal: vec3f) -> f32
{
    if (!Sample.Shadowed || !FeatureEnabled(Frame, FeatureDirectShadow))
    {
        return 1.0;
    }
    let Bias = ResolveSurfaceBias(Position);
    return TraverseSceneShadow(Position + Normal * Bias, Sample.Direction, 0.5 * Bias, max(Sample.Range - 0.3, 0.0), 4.0);
}
