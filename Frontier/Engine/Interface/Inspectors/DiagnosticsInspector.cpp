/*==========================================================================================================================================
                                                          DIAGNOSTICSINSPECTOR.CPP
==========================================================================================================================================*/
// 🧩 DiagnosticsConfiguration: timing and memory overlays.

#include "Engine/Interface/Inspectors/DiagnosticsInspector.h"

#if FRONTIER_EDITOR && defined(FRONTIER_WITH_INTERFACE_SDK)

#include "Engine/Interface/DiagramControls.h"
#include "Engine/Interface/InspectorControls.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdio>

#endif

namespace Frontier
{

#if FRONTIER_EDITOR && defined(FRONTIER_WITH_INTERFACE_SDK)

void DiagnosticsInspector::EnumerateSwitches(std::vector<InspectorSwitchEntry>& OutSwitches)
{
    OutSwitches.push_back({"Timing HUD", "GPU pass ms", &Parameters.TimingOverlayEnabled});
    OutSwitches.push_back({"Memory HUD", "VRAM residency", &Parameters.MemoryOverlayEnabled});
}

void DiagnosticsInspector::ConstructInspector()
{
    const InspectorPalette Palette = InspectorPalette::Resolve();
    const EditorTypefaces  Faces   = EditorTypefaces::Resolve();

    char FpsHeader[80]{};
    std::snprintf(FpsHeader, sizeof(FpsHeader), "FRAME BUDGET · %.1f FPS (%.2f ms)",
                  Parameters.FramesPerSecond, Parameters.FrameTimeMs);
    DiagramControls::ConstructTimeSeriesPlot(Palette, Faces, FpsHeader,
                                             Parameters.FrameHistoryMs.data(), Parameters.FrameHistoryMs.size(),
                                             0.0f, 33.3f, 16.67f, Palette.LiveGreen);

    char RayBuf[32]{};
    char LightBuf[32]{};
    char VolBuf[32]{};
    char DrawBuf[32]{};
    std::snprintf(RayBuf, sizeof(RayBuf), "%.2f ms", Parameters.GpuRayQueryMs);
    std::snprintf(LightBuf, sizeof(LightBuf), "%.2f ms", Parameters.GpuLightingMs);
    std::snprintf(VolBuf, sizeof(VolBuf), "%.2f ms", Parameters.GpuVolumetricMs);
    std::snprintf(DrawBuf, sizeof(DrawBuf), "%u", Parameters.ActiveDrawCount);

    const std::array<InspectorReadoutCell, 4> Cells = {{
        {"RAY / SDF", RayBuf},
        {"LIGHTING", LightBuf},
        {"VOLUMETRICS", VolBuf},
        {"CLUSTERS", DrawBuf},
    }};
    InspectorControls::ConstructReadoutStrip(Palette, Faces, Cells.data(), Cells.size());
}

#elif FRONTIER_EDITOR

void DiagnosticsInspector::EnumerateSwitches(std::vector<InspectorSwitchEntry>&) {}
void DiagnosticsInspector::ConstructInspector() {}

#endif

} // namespace Frontier
