//============================================================================================================================================
//                                                          DEVICEPOINT.VERT.SLANG
//============================================================================================================================================
// 📦 Vertex entry for point glyphs: one instance per point, four corners expanded to a constant-pixel-size billboard.

#include "DeviceBindings.slang"
#include "PointRaster.slang"

struct PointInput
{
    float3 Position : POSITION;
    float  Glyph    : TEXCOORD0;
};

struct PointOutput
{
    float4 Clip  : SV_Position;
    float2 Local : TEXCOORD0;
    float  Glyph : TEXCOORD1;
};

[shader("vertex")]
PointOutput main(PointInput In, uint Corner : SV_VertexID)
{
    PointVarying Varying = PointVertex(ViewBlock, DrawBlock, In.Position, In.Glyph, Corner);
    PointOutput  Out;
    Out.Clip  = Varying.Clip;
    Out.Local = Varying.Local;
    Out.Glyph = Varying.Glyph;
    return Out;
}
