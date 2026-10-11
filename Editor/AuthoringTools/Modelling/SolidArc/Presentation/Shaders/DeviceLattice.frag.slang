//============================================================================================================================================
//                                                         DEVICELATTICE.FRAG.SLANG
//============================================================================================================================================
// 📦 Fragment entry for the background lattice: unprojects the pixel to a world ray and shades the ground plane analytically.

#include "DeviceBindings.slang"
#include "LatticeProjection.slang"

struct LatticeInput
{
    float4 Clip : SV_Position;
    float2 Ndc  : TEXCOORD0;
};

struct LatticeOutput
{
    float4 Colour : SV_Target0;
};

[shader("fragment")]
LatticeOutput main(LatticeInput In)
{
    float4 Near = mul(ViewBlock.ClipView, float4(In.Ndc, 0.0f, 1.0f));
    float4 Far  = mul(ViewBlock.ClipView, float4(In.Ndc, 1.0f, 1.0f));
    float3 NearPoint = Near.xyz / Near.w;
    float3 FarPoint  = Far.xyz / Far.w;
    bool   Perspective = ViewBlock.EyePosition.w > 0.5f;
    float3 Origin      = Perspective ? ViewBlock.EyePosition.xyz : NearPoint;
    float3 Direction   = normalize(FarPoint - NearPoint);
    // 📝 PixelAngle and PixelWorld ride in the unused lanes of DepthPolicy (yz), packed by the host from ViewRecord.
    LatticeSample Sample = LatticeShade(ViewBlock, Origin, Direction, ViewBlock.DepthPolicy.y, ViewBlock.DepthPolicy.z);
    if (Sample.Colour.w <= 0.002f) discard;
    LatticeOutput Out;
    Out.Colour = Sample.Colour;   // 📝 the lattice is drawn first with depth test and write off, so it never needs to publish a depth
    return Out;
}
