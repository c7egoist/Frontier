/*==========================================================================================================================================
                                                         RENDERINSPECTIONMODES.CPP
==========================================================================================================================================*/
// 🧩 The names of the inspection views (RefreshToggles::Inspection) and distance slices.

#include "Engine/Interface/Inspectors/RenderInspectionModes.h"

namespace Frontier
{


// 📝 The VehicleHMI demo's inspection views (EditorControls.js select), in its order: the index is the port's
//    RefreshToggles::Inspection, which DisplayPresent and the resolve shaders read.
const char* const RenderInspectionModes::ModeNames[RenderInspectionModes::ModeCount] = {
    "Final image",
    "Direct sun only",
    "Indirect diffuse (GI)",
    "Indirect irradiance (denoised)",
    "ReSTIR irradiance (raw, no denoise)",
    "Glossy reflections",
    "BVH / Distance-field inspection",
    "Surface cards (texel space)",
    "Normals",
    "Albedo",
    "Clusters: visibility buffer IDs",
    "Clusters: deferred resolve",
    "Clusters: Hi-Z pyramid",
    "Clusters: glass layers (front/back)",
    "Clusters: LOD levels (near\xE2\x86\x92" "far)",
};

const char* const RenderInspectionModes::DistanceNames[RenderInspectionModes::DistanceCount] = {
    "Near (32 m)",
    "Medium (160 m)",
    "Far (Full)",
};

} // namespace Frontier
