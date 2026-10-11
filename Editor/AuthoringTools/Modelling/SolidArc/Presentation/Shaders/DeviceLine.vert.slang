//============================================================================================================================================
//                                                          DEVICELINE.VERT.SLANG
//============================================================================================================================================
// 📦 Vertex entry for screen-width segments: one instance per segment, four corners expanded to a constant-pixel-width quad.

#include "DeviceBindings.slang"
#include "LineRaster.slang"

struct LineInput
{
    float3 A : POSITION0;
    float3 B : POSITION1;
};

struct LineOutput
{
    float4 Clip          : SV_Position;
    float  Across        : TEXCOORD0;
    float  Along         : TEXCOORD1;
    float  SegmentPixels : TEXCOORD2;
};

[shader("vertex")]
LineOutput main(LineInput In, uint Corner : SV_VertexID)
{
    LineVarying Varying = LineVertex(ViewBlock, DrawBlock, In.A, In.B, Corner);
    LineOutput  Out;
    Out.Clip          = Varying.Clip;
    Out.Across        = Varying.Across;
    Out.Along         = Varying.Along;
    Out.SegmentPixels = Varying.SegmentPixels;
    return Out;
}
