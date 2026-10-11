//============================================================================================================================================
//                                                         DEVICESURFACE.VERT.SLANG
//============================================================================================================================================
// 📦 Vertex entry for shaded faces: one vertex per tessellation sample, interleaved position, normal and parameter.

#include "DeviceBindings.slang"
#include "SurfaceRaster.slang"

struct SurfaceInput
{
    float3 Position  : POSITION;
    float3 Normal    : NORMAL;
    float2 Parameter : TEXCOORD0;
};

struct SurfaceOutput
{
    float4 Clip          : SV_Position;
    float3 WorldPosition : TEXCOORD0;
    float3 WorldNormal   : TEXCOORD1;
    float2 Parameter     : TEXCOORD2;
};

[shader("vertex")]
SurfaceOutput main(SurfaceInput In)
{
    SurfaceVarying Varying = SurfaceVertex(ViewBlock, DrawBlock, In.Position, In.Normal, In.Parameter);
    SurfaceOutput  Out;
    Out.Clip          = Varying.Clip;
    Out.WorldPosition = Varying.WorldPosition;
    Out.WorldNormal   = Varying.WorldNormal;
    Out.Parameter     = Varying.Parameter;
    return Out;
}
