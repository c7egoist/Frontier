/*==========================================================================================================================================
                                                            PLANETINSPECTOR.CPP
==========================================================================================================================================*/
// 🧩 PlanetConfiguration: one ephemeris planet.

#include "Engine/Interface/Inspectors/PlanetInspector.h"

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

void PlanetInspector::EnumerateSwitches(std::vector<InspectorSwitchEntry>& OutSwitches)
{
    OutSwitches.push_back({"Ring System", "Banded annulus", &Parameters.RingSystem});
    OutSwitches.push_back({"Atmosphere", "Limb scattering shell", &Parameters.AtmosphereShell});
}

void PlanetInspector::ConstructInspector()
{
    const InspectorPalette Palette = InspectorPalette::Resolve();
    const EditorTypefaces  Faces   = EditorTypefaces::Resolve();

    bool Changed = false;
    int  Body    = static_cast<int>(std::min<uint32_t>(Parameters.Body, static_cast<uint32_t>(PlanetBodyNames.size() - 1)));
    if (InspectorControls::ConstructSegmentedRow(Palette, Faces, "##PlanetBody", "Ephemeris", Body, PlanetBodyNames.data(),
                                                 static_cast<int>(PlanetBodyNames.size())))
    {
        Parameters.Body = static_cast<uint32_t>(Body);
        Changed         = true;
    }
    Changed |= InspectorControls::ConstructSliderRow(Palette, Faces, "##PlanetSize", "Drawn Diameter", Parameters.ApparentDiameterDegrees, 0.05f, 6.0f, "%.2f deg");
    Changed |= InspectorControls::ConstructSliderRow(Palette, Faces, "##PlanetGain", "Brightness", Parameters.Brightness, 0.0f, 4.0f, "%.2f");
    if (Changed)
    {
        Parameters.AdvanceRevision();
    }
}

#elif FRONTIER_EDITOR

void PlanetInspector::EnumerateSwitches(std::vector<InspectorSwitchEntry>&) {}
void PlanetInspector::ConstructInspector() {}

#endif

} // namespace Frontier
