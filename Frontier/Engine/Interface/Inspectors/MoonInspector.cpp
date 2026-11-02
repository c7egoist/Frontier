/*==========================================================================================================================================
                                                             MOONINSPECTOR.CPP
==========================================================================================================================================*/
// 🧩 MoonConfiguration: the scene moons.

#include "Engine/Interface/Inspectors/MoonInspector.h"

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

void MoonInspector::EnumerateSwitches(std::vector<InspectorSwitchEntry>& OutSwitches)
{
    OutSwitches.push_back({"Secondary Body", "Companion orbit", &Parameters.SecondaryMoonEnabled});
}

void MoonInspector::ConstructInspector()
{
    const InspectorPalette Palette = InspectorPalette::Resolve();
    const EditorTypefaces  Faces   = EditorTypefaces::Resolve();

    static constexpr std::array<float, 8> PhaseSamples = {{0.0f, 0.22f, 0.50f, 0.78f, 1.0f, 0.78f, 0.50f, 0.22f}};
    const int ActiveDisc = std::clamp(static_cast<int>(std::lround(Parameters.PrimaryPhase * 7.0f)), 0, 7);
    DiagramControls::ConstructDiscSequence(Palette, Faces, "ORBITAL ILLUMINATION SEQUENCE",
                                           PhaseSamples.data(), PhaseSamples.size(),
                                           ActiveDisc, ParseHexSpectrum("#dce6f7", Palette.TextPrimary));

    bool Changed = false;
    Changed |= InspectorControls::ConstructSliderRow(Palette, Faces, "##MoonPhase", "Primary Phase", Parameters.PrimaryPhase, 0.0f, 1.0f, "%.2f");
    Changed |= InspectorControls::ConstructSliderRow(Palette, Faces, "##MoonOrb", "Primary Orbit", Parameters.PrimaryOrbitDegrees, 0.0f, 360.0f, "%.0f deg");
    Changed |= InspectorControls::ConstructSliderRow(Palette, Faces, "##MoonAlb", "Surface Albedo", Parameters.PrimaryAlbedo, 0.02f, 0.60f, "%.2f");
    Changed |= InspectorControls::ConstructSliderRow(Palette, Faces, "##EarthSh", "Planetshine", Parameters.EarthshineLuminance, 0.0f, 1.0f, "%.2f");
    if (Parameters.SecondaryMoonEnabled)
    {
        Changed |= InspectorControls::ConstructSliderRow(Palette, Faces, "##MoonSecOrb", "Secondary Orbit", Parameters.SecondaryOrbitDegrees, 0.0f, 360.0f, "%.0f deg");
    }
    if (Changed)
    {
        Parameters.AdvanceRevision();
    }
}

#elif FRONTIER_EDITOR

void MoonInspector::EnumerateSwitches(std::vector<InspectorSwitchEntry>&) {}
void MoonInspector::ConstructInspector() {}

#endif

} // namespace Frontier
