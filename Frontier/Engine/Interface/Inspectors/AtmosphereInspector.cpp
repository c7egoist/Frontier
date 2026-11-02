/*==========================================================================================================================================
                                                          ATMOSPHEREINSPECTOR.CPP
==========================================================================================================================================*/
// 🧩 AtmosphereConfiguration: Rayleigh, Mie and ozone scattering.

#include "Engine/Interface/Inspectors/AtmosphereInspector.h"

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

void AtmosphereInspector::EnumerateSwitches(std::vector<InspectorSwitchEntry>& OutSwitches)
{
    OutSwitches.push_back({"Multi-Scatter", "Precomputed LUT", &Parameters.MultiScatteringLut});
    OutSwitches.push_back({"Aerial Fog", "Camera volume", &Parameters.AerialPerspective});
}

void AtmosphereInspector::ConstructInspector()
{
    const InspectorPalette Palette = InspectorPalette::Resolve();
    const EditorTypefaces  Faces   = EditorTypefaces::Resolve();

    static const char* const StrataTiers[3] = {
        "Ozone Absorption (18-50 km)",
        "Rayleigh Molecular (3-18 km)",
        "Mie Aerosol Boundary (0-3 km)",
    };
    DiagramControls::ConstructStrataPlot(Palette, Faces,
                                         ParseHexSpectrum("#2a4880", Palette.ThemeAccent),
                                         ParseHexSpectrum("#8d6b48", Palette.WarmAmber),
                                         StrataTiers, 3);

    bool Changed = false;
    Changed |= InspectorControls::ConstructSliderRow(Palette, Faces, "##Rayleigh", "Rayleigh Scale", Parameters.RayleighScattering, 0.0f, 4.0f, "%.2f");
    Changed |= InspectorControls::ConstructSliderRow(Palette, Faces, "##MieTurb", "Mie Turbidity", Parameters.MieTurbidity, 1.0f, 10.0f, "%.2f");
    Changed |= InspectorControls::ConstructSliderRow(Palette, Faces, "##MieG", "Mie Anisotropy g", Parameters.MieAnisotropyG, 0.0f, 0.98f, "%.2f");
    Changed |= InspectorControls::ConstructSliderRow(Palette, Faces, "##Ozone", "Ozone Absorption", Parameters.OzoneAbsorptionScale, 0.0f, 3.0f, "%.2f");
    Changed |= InspectorControls::ConstructSliderRow(Palette, Faces, "##AtmoThick", "Atmosphere Height", Parameters.AtmosphereThicknessKm, 20.0f, 120.0f, "%.0f km");
    if (Changed)
    {
        Parameters.AdvanceRevision();
    }
}

#elif FRONTIER_EDITOR

void AtmosphereInspector::EnumerateSwitches(std::vector<InspectorSwitchEntry>&) {}
void AtmosphereInspector::ConstructInspector() {}

#endif

} // namespace Frontier
