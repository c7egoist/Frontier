//============================================================================================================================================
//                                                         DEVICELATTICE.VERT.SLANG
//============================================================================================================================================
// 📦 Vertex entry for the background lattice: one oversized triangle covering the target.

#include "DeviceBindings.slang"

struct LatticeOutput
{
    float4 Clip : SV_Position;
    float2 Ndc  : TEXCOORD0;
};

[shader("vertex")]
LatticeOutput main(uint Corner : SV_VertexID)
{
    // 📝 (0,0) (2,0) (0,2) in unit space covers [-1,1]^2 with one triangle and no diagonal seam.
    float2 Unit = float2(float((Corner << 1u) & 2u), float(Corner & 2u));
    LatticeOutput Out;
    Out.Ndc  = Unit * 2.0f - 1.0f;
    Out.Clip = float4(Out.Ndc, 0.0f, 1.0f);
    return Out;
}
