/*==========================================================================================================================================
                                                             CLOUDINSPECTOR.CPP
==========================================================================================================================================*/
// 🧩 CloudConfiguration: the global cloud layer and bounded local clouds.

#include "Engine/Interface/Inspectors/CloudInspector.h"

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

void CloudInspector::EnumerateSwitches(std::vector<InspectorSwitchEntry>& OutSwitches)
{
    OutSwitches.push_back({"Local Volume", "Bounded box", &Parameters.LocalVolume});
    OutSwitches.push_back({"Temporal Reproj", "Quarter-res", &Parameters.TemporalReprojection});
    OutSwitches.push_back({"Ground Shadows", "Transmittance", &Parameters.CastGroundShadows});
}

void CloudInspector::ConstructInspector()
{
    const InspectorPalette Palette = InspectorPalette::Resolve();
    const EditorTypefaces  Faces   = EditorTypefaces::Resolve();

    static const char* const CloudTiers[3] = {
        "Anvil Top Envelope",
        "Cumulus Perlin-Worley Deck",
        "Sub-Cloud Clear Air",
    };
    DiagramControls::ConstructStrataPlot(Palette, Faces,
                                         ParseHexSpectrum("#4f6e96", Palette.ThemeAccent),
                                         ParseHexSpectrum("#232c38", Palette.InsetFieldBg),
                                         CloudTiers, 3);

    bool Changed = false;
    Changed |= InspectorControls::ConstructSliderRow(Palette, Faces, "##CldCov", "Coverage", Parameters.Coverage, 0.0f, 1.0f, "%.2f");
    Changed |= InspectorControls::ConstructSliderRow(Palette, Faces, "##CldExt", "Extinction Density", Parameters.ExtinctionDensity, 0.05f, 3.0f, "%.2f");
    Changed |= InspectorControls::ConstructSliderRow(Palette, Faces, "##CldBase", "Base Altitude", Parameters.BaseAltitudeMetres, 200.0f, 5000.0f, "%.0f m");
    Changed |= InspectorControls::ConstructSliderRow(Palette, Faces, "##CldThick", "Layer Thickness", Parameters.LayerThicknessMetres, 200.0f, 4000.0f, "%.0f m");
    Changed |= InspectorControls::ConstructSliderRow(Palette, Faces, "##CldWind", "Drift Speed", Parameters.WindDriftSpeed, 0.0f, 45.0f, "%.1f m/s");
    Changed |= InspectorControls::ConstructSliderRow(Palette, Faces, "##CldSilv", "Silver Lining", Parameters.SilverLiningPower, 0.0f, 2.0f, "%.2f");
    if (Changed)
    {
        Parameters.AdvanceRevision();
    }
}

#elif FRONTIER_EDITOR

void CloudInspector::EnumerateSwitches(std::vector<InspectorSwitchEntry>&) {}
void CloudInspector::ConstructInspector() {}

#endif

} // namespace Frontier
