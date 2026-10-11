//============================================================================================================================================
//                                                           DEVICEBINDINGS.SLANG
//============================================================================================================================================
// 📦 Descriptor set 0 shared by every device raster entry point: the view record and the per-draw record, both dynamic uniform offsets.

#ifndef SOLIDARC_DEVICE_BINDINGS
#define SOLIDARC_DEVICE_BINDINGS

#include "ShadingRecords.slang"

[[vk::binding(0, 0)]] ConstantBuffer<ViewRecord> ViewBlock;
[[vk::binding(1, 0)]] ConstantBuffer<DrawRecord> DrawBlock;

// 📝 The pick identity travels as float bits in DrawRecord.Selection.y (same packing the software raster mirrors).
uint PickIdentityOf(DrawRecord Draw)
{
    return asuint(Draw.Selection.y);
}

struct DeviceOutput
{
    float4 Colour : SV_Target0;
    uint   Pick   : SV_Target1;
};

#endif
