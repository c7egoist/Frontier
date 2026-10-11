//============================================================================================================================================
//                                                          DEVICEPOINT.FRAG.SLANG
//============================================================================================================================================
// 📦 Fragment entry for point glyphs: distance-field glyph coverage and the pick identity.

#include "DeviceBindings.slang"
#include "PointRaster.slang"

struct PointInput
{
    float4 Clip  : SV_Position;
    float2 Local : TEXCOORD0;
    float  Glyph : TEXCOORD1;
};

[shader("fragment")]
DeviceOutput main(PointInput In)
{
    PointVarying Varying;
    Varying.Clip  = In.Clip;
    Varying.Local = In.Local;
    Varying.Glyph = In.Glyph;
    DeviceOutput Out;
    Out.Colour = PointFragment(ViewBlock, DrawBlock, Varying);
    // 📝 Same 0.05 floor the software raster applies before a fragment may claim a pick pixel; it also keeps empty quad corners out of the pick target.
    if (Out.Colour.w <= 0.05f) discard;
    Out.Pick   = PickIdentityOf(DrawBlock);
    return Out;
}
