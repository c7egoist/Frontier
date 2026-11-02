/*==========================================================================================================================================
                                                             WINDINSPECTOR.CPP
==========================================================================================================================================*/
// 🧩 WindConfiguration: the shared weather force field.

#include "Engine/Interface/Inspectors/WindInspector.h"

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

void WindInspector::EnumerateSwitches(std::vector<InspectorSwitchEntry>& OutSwitches)
{
    OutSwitches.push_back({"Advect Clouds", "Sky deck", &Parameters.AdvectClouds});
    OutSwitches.push_back({"Advect Plumes", "Eulerian grid", &Parameters.AdvectPlumes});
    OutSwitches.push_back({"Advect Particles", "GPU drag", &Parameters.AdvectParticles});
}

void WindInspector::ConstructInspector()
{
    const InspectorPalette Palette = InspectorPalette::Resolve();
    const EditorTypefaces  Faces   = EditorTypefaces::Resolve();

    char WindNote[64]{};
    std::snprintf(WindNote, sizeof(WindNote), "ADVECTION %.0f deg · %.1f m/s",
                  Parameters.DirectionDegrees, Parameters.SpeedMetresPerSecond);
    const float Magnitude = std::clamp(Parameters.SpeedMetresPerSecond / 35.0f, 0.08f, 1.0f);
    bool        Changed   = false;
    Changed |= DiagramControls::ConstructPolarDial(Palette, Faces, "##WindPolarDial",
                                                   WindNote, Parameters.DirectionDegrees, Magnitude,
                                                   ParseHexSpectrum("#62c3a5", Palette.LiveGreen));

    Changed |= InspectorControls::ConstructSliderRow(Palette, Faces, "##WndDir", "Heading", Parameters.DirectionDegrees, 0.0f, 360.0f, "%.0f deg");
    Changed |= InspectorControls::ConstructSliderRow(Palette, Faces, "##WndSpd", "Mean Speed", Parameters.SpeedMetresPerSecond, 0.0f, 35.0f, "%.1f m/s");
    Changed |= InspectorControls::ConstructSliderRow(Palette, Faces, "##WndGust", "Gust Amplitude", Parameters.GustAmplitude, 0.0f, 20.0f, "%.1f m/s");
    Changed |= InspectorControls::ConstructSliderRow(Palette, Faces, "##WndCurl", "Curl Turbulence", Parameters.CurlNoiseTurbulence, 0.0f, 1.0f, "%.2f");
    Changed |= InspectorControls::ConstructSliderRow(Palette, Faces, "##WndFreq", "Curl Frequency", Parameters.CurlFrequencyHz, 0.02f, 2.0f, "%.2f Hz");
    if (Changed)
    {
        Parameters.AdvanceRevision();
    }
}

#elif FRONTIER_EDITOR

void WindInspector::EnumerateSwitches(std::vector<InspectorSwitchEntry>&) {}
void WindInspector::ConstructInspector() {}

#endif

} // namespace Frontier
