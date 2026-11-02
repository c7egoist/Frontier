/*==========================================================================================================================================
                                                        RENDERPIPELINEINSPECTOR.CPP
==========================================================================================================================================*/
// 🧩 RenderPipelineConfiguration: the ported renderer's switches, quality and inspection views.

#include "Engine/Interface/Inspectors/RenderPipelineInspector.h"

#if FRONTIER_EDITOR && defined(FRONTIER_WITH_INTERFACE_SDK)

#include "Engine/Interface/DiagramControls.h"
#include "Engine/Interface/InspectorControls.h"
#include "Engine/Interface/Inspectors/RenderInspectionModes.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdio>

#endif

namespace Frontier
{

#if FRONTIER_EDITOR && defined(FRONTIER_WITH_INTERFACE_SDK)

void RenderPipelineInspector::EnumerateSwitches(std::vector<InspectorSwitchEntry>& OutSwitches)
{
    OutSwitches.push_back({"RTX Hardware", "RayQuery", &Parameters.HardwareRayQueryTier});
    OutSwitches.push_back({"Indirect GI", "Multi-bounce", &Parameters.GlobalIllumination});
    OutSwitches.push_back({"Temporal AA", "Subpixel jitter", &Parameters.TemporalAntiAliasing});
    OutSwitches.push_back({"Reflections", "BVH / RayQuery", &Parameters.ScreenSpaceReflections});
}

void RenderPipelineInspector::ConstructInspector()
{
    const InspectorPalette Palette = InspectorPalette::Resolve();
    const EditorTypefaces  Faces   = EditorTypefaces::Resolve();

    static const char* const TierLabels[2]    = {"GTX · SDF+BVH", "RTX · RayQuery"};
    static const char* const QualityLabels[3] = {"Low", "Medium", "Ultra"};

    int  TierIndex = Parameters.HardwareRayQueryTier ? 1 : 0;
    bool Changed   = false;
    InspectorControls::ConstructSectionDivider(Palette, Faces, "DUAL-TIER GPU ARCHITECTURE");
    if (InspectorControls::ConstructSegmentedRow(Palette, Faces, "##GpuTier", "GPU Path", TierIndex, TierLabels, 2))
    {
        Parameters.HardwareRayQueryTier = (TierIndex == 1);
        Changed                         = true;
    }
    Changed |= InspectorControls::ConstructSegmentedRow(Palette, Faces, "##QualityTier", "Quality", Parameters.QualityTier, QualityLabels, 3);

    InspectorControls::ConstructSectionDivider(Palette, Faces, "BUFFER INSPECTION & EXPOSURE");
    uint32_t ModeIdx = static_cast<uint32_t>(std::clamp(Parameters.InspectionModeIndex, 0, 14));
    if (InspectorControls::ConstructIntegerSliderRow(Palette, Faces, "##InspMode", "Buffer Index", ModeIdx, 0u, 14u))
    {
        Parameters.InspectionModeIndex = static_cast<int>(ModeIdx);
        Changed                        = true;
    }
    const InspectorReadoutCell BufferCell{"ACTIVE BUFFER", RenderInspectionModes::ModeNames[std::clamp(Parameters.InspectionModeIndex, 0, 14)]};
    InspectorControls::ConstructReadoutStrip(Palette, Faces, &BufferCell, 1);

    Changed |= InspectorControls::ConstructSegmentedRow(Palette, Faces, "##InspDist", "Probe Range",
                                                        Parameters.InspectionDistanceMode,
                                                        RenderInspectionModes::DistanceNames,
                                                        static_cast<int>(RenderInspectionModes::DistanceCount));
    Changed |= InspectorControls::ConstructSliderRow(Palette, Faces, "##ExposureEv", "Exposure EV", Parameters.ExposureCompensationEv, -4.0f, 4.0f, "%+.2f EV");
    Changed |= InspectorControls::ConstructSliderRow(Palette, Faces, "##BloomInt", "Bloom Intensity", Parameters.BloomIntensity, 0.0f, 1.5f, "%.2f");
    if (Changed)
    {
        Parameters.AdvanceRevision();
    }
}

#elif FRONTIER_EDITOR

void RenderPipelineInspector::EnumerateSwitches(std::vector<InspectorSwitchEntry>&) {}
void RenderPipelineInspector::ConstructInspector() {}

#endif

} // namespace Frontier
