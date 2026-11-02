/*==========================================================================================================================================
                                                             STARINSPECTOR.CPP
==========================================================================================================================================*/
// 🧩 StarConfiguration: the Hipparcos star field.

#include "Engine/Interface/Inspectors/StarInspector.h"

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

void StarInspector::ConstructInspector()
{
    const InspectorPalette Palette = InspectorPalette::Resolve();
    const EditorTypefaces  Faces   = EditorTypefaces::Resolve();

    bool Changed = false;
    Changed |= InspectorControls::ConstructIntegerSliderRow(Palette, Faces, "##StarCnt", "Hipparcos Count", Parameters.HipparcosCount, 500u, 9110u);
    Changed |= InspectorControls::ConstructSliderRow(Palette, Faces, "##StarGain", "Magnitude Gain", Parameters.MagnitudeGain, 0.1f, 3.0f, "%.2f");
    Changed |= InspectorControls::ConstructSliderRow(Palette, Faces, "##MilkyWay", "Galactic Band", Parameters.MilkyWayLuminance, 0.0f, 2.0f, "%.2f");
    Changed |= InspectorControls::ConstructSliderRow(Palette, Faces, "##Sidereal", "Sidereal Rate", Parameters.SiderealSpeed, 0.0f, 20.0f, "%.2f x");
    Changed |= InspectorControls::ConstructSliderRow(Palette, Faces, "##Scint", "Scintillation", Parameters.AtmosphericScintillate, 0.0f, 1.0f, "%.2f");
    if (Changed)
    {
        Parameters.AdvanceRevision();
    }
}

#elif FRONTIER_EDITOR

void StarInspector::ConstructInspector() {}

#endif

} // namespace Frontier
