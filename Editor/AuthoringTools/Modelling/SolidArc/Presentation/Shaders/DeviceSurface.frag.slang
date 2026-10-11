//============================================================================================================================================
//                                                         DEVICESURFACE.FRAG.SLANG
//============================================================================================================================================
// 📦 Fragment entry for shaded faces: matcap, plastic or flat shading from SurfaceRaster.slang, plus the pick identity.

#include "DeviceBindings.slang"
#include "SurfaceRaster.slang"

// 📝 The studio is analytic, so the device evaluates the very function the software raster pre-renders into its layers.
float3 MatcapLookup(uint Layer, float3 ViewNormal)
{
    return MatcapStudioSample(Layer, ViewNormal);
}

struct SurfaceInput
{
    float4 Clip          : SV_Position;
    float3 WorldPosition : TEXCOORD0;
    float3 WorldNormal   : TEXCOORD1;
    float2 Parameter     : TEXCOORD2;
};

[shader("fragment")]
DeviceOutput main(SurfaceInput In, bool Front : SV_IsFrontFace)
{
    SurfaceVarying Varying;
    Varying.Clip          = In.Clip;
    Varying.WorldPosition = In.WorldPosition;
    Varying.WorldNormal   = In.WorldNormal;
    Varying.Parameter     = In.Parameter;
    DeviceOutput Out;
    Out.Colour = SurfaceFragment(ViewBlock, DrawBlock, Varying, Front);
    // 📝 Same 0.05 floor the software raster applies before a fragment may claim a pick pixel; it also keeps empty quad corners out of the pick target.
    if (Out.Colour.w <= 0.05f) discard;
    Out.Pick   = PickIdentityOf(DrawBlock);
    return Out;
}
