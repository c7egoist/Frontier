/*==========================================================================================================================================
                                                         OPTICALFLAREINSPECTOR.CPP
==========================================================================================================================================*/
// 🧩 OpticalFlareConfiguration: the aperture lens flare.

#include "Engine/Interface/Inspectors/OpticalFlareInspector.h"

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

void OpticalFlareInspector::EnumerateSwitches(std::vector<InspectorSwitchEntry>& OutSwitches)
{
    OutSwitches.push_back({"Anamorphic", "Horizontal streak", &Parameters.AnamorphicStreak});
    OutSwitches.push_back({"Starburst", "Blade spikes", &Parameters.DiffractionStarburst});
}

void OpticalFlareInspector::ConstructInspector()
{
    const InspectorPalette Palette = InspectorPalette::Resolve();
    const EditorTypefaces  Faces   = EditorTypefaces::Resolve();

    char BladeLabel[48]{};
    std::snprintf(BladeLabel, sizeof(BladeLabel), "%u-BLADE APERTURE IRIS", Parameters.ApertureBladeCount);
    DiagramControls::ConstructPolygonDiagram(Palette, Faces, BladeLabel,
                                             Parameters.ApertureBladeCount,
                                             std::clamp(Parameters.HaloRadius, 0.15f, 0.95f),
                                             Parameters.ChromaticDispersion,
                                             ParseHexSpectrum("#f0a954", Palette.WarmAmber));

    bool Changed = false;
    Changed |= InspectorControls::ConstructSliderRow(Palette, Faces, "##FlareInt", "Intensity", Parameters.Intensity, 0.0f, 2.5f, "%.2f");
    Changed |= InspectorControls::ConstructSliderRow(Palette, Faces, "##FlareThr", "Threshold", Parameters.LuminanceThreshold, 0.5f, 6.0f, "%.2f");
    Changed |= InspectorControls::ConstructIntegerSliderRow(Palette, Faces, "##FlareBlades", "Aperture Blades", Parameters.ApertureBladeCount, 3u, 12u);
    Changed |= InspectorControls::ConstructSliderRow(Palette, Faces, "##FlareHalo", "Halo Radius", Parameters.HaloRadius, 0.05f, 1.0f, "%.2f");
    Changed |= InspectorControls::ConstructSliderRow(Palette, Faces, "##FlareDisp", "Chromatic Dispersion", Parameters.ChromaticDispersion, 0.0f, 1.0f, "%.2f");
    if (Changed)
    {
        Parameters.AdvanceRevision();
    }
}

#elif FRONTIER_EDITOR

void OpticalFlareInspector::EnumerateSwitches(std::vector<InspectorSwitchEntry>&) {}
void OpticalFlareInspector::ConstructInspector() {}

#endif

} // namespace Frontier
