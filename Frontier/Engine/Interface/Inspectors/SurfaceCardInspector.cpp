/*==========================================================================================================================================
                                                          SURFACECARDINSPECTOR.CPP
==========================================================================================================================================*/
// 🧩 SurfaceCardConfiguration: the surface card atlas and its radiosity budget.

#include "Engine/Interface/Inspectors/SurfaceCardInspector.h"

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

void SurfaceCardInspector::EnumerateSwitches(std::vector<InspectorSwitchEntry>& OutSwitches)
{
    OutSwitches.push_back({"Temporal History", "Multi-frame", &Parameters.TemporalAccumulate});
    OutSwitches.push_back({"SH Probes", "Sky irradiance", &Parameters.IrradianceProbes});
}

void SurfaceCardInspector::ConstructInspector()
{
    const InspectorPalette Palette = InspectorPalette::Resolve();
    const EditorTypefaces  Faces   = EditorTypefaces::Resolve();

    bool Changed = false;
    Changed |= InspectorControls::ConstructIntegerSliderRow(Palette, Faces, "##CardAtlas", "Atlas Resolution", Parameters.AtlasResolutionPx, 256u, 4096u, " px");
    Changed |= InspectorControls::ConstructSliderRow(Palette, Faces, "##CardBounce", "Indirect Bounce Gain", Parameters.IndirectBounceGain, 0.0f, 3.0f, "%.2f");
    Changed |= InspectorControls::ConstructIntegerSliderRow(Palette, Faces, "##CardSides", "Projections / Object", Parameters.CardsPerObject, 2u, 6u);
    Changed |= InspectorControls::ConstructSliderRow(Palette, Faces, "##SkyVis", "Sky Visibility Weight", Parameters.SkyVisibilityWeight, 0.0f, 2.0f, "%.2f");
    if (Changed)
    {
        Parameters.AdvanceRevision();
    }
}

#elif FRONTIER_EDITOR

void SurfaceCardInspector::EnumerateSwitches(std::vector<InspectorSwitchEntry>&) {}
void SurfaceCardInspector::ConstructInspector() {}

#endif

} // namespace Frontier
