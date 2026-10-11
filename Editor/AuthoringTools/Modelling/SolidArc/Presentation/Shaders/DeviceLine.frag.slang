//============================================================================================================================================
//                                                          DEVICELINE.FRAG.SLANG
//============================================================================================================================================
// 📦 Fragment entry for screen-width segments: analytic coverage, optional dashing and the pick identity.

#include "DeviceBindings.slang"
#include "LineRaster.slang"

struct LineInput
{
    float4 Clip          : SV_Position;
    float  Across        : TEXCOORD0;
    float  Along         : TEXCOORD1;
    float  SegmentPixels : TEXCOORD2;
};

[shader("fragment")]
DeviceOutput main(LineInput In)
{
    LineVarying Varying;
    Varying.Clip          = In.Clip;
    Varying.Across        = In.Across;
    Varying.Along         = In.Along;
    Varying.SegmentPixels = In.SegmentPixels;
    DeviceOutput Out;
    // 📝 Dashing rides in DrawRecord.Surface.w; the host packs DrawRecord::Dashed there.
    Out.Colour = LineFragment(ViewBlock, DrawBlock, Varying, DrawBlock.Surface.w > 0.5f);
    // 📝 Same 0.05 floor the software raster applies before a fragment may claim a pick pixel; it also keeps empty quad corners out of the pick target.
    if (Out.Colour.w <= 0.05f) discard;
    Out.Pick   = PickIdentityOf(DrawBlock);
    return Out;
}
