/*==========================================================================================================================================
                                                           LIGHTNINGINSPECTOR.CPP
==========================================================================================================================================*/
// 🧩 LightningConfiguration: storm flashes and delayed thunder.

#include "Engine/Interface/Inspectors/LightningInspector.h"

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

void LightningInspector::EnumerateSwitches(std::vector<InspectorSwitchEntry>& OutSwitches)
{
    OutSwitches.push_back({"Auto Discharge", "Stochastic", &Parameters.AutoStormDischarge});
    OutSwitches.push_back({"Shockwave", "Delayed impulse", &Parameters.AcousticShockwave});
}

void LightningInspector::ConstructInspector()
{
    const InspectorPalette Palette = InspectorPalette::Resolve();
    const EditorTypefaces  Faces   = EditorTypefaces::Resolve();

    bool Changed = false;
    Changed |= InspectorControls::ConstructSliderRow(Palette, Faces, "##LgtRate", "Strikes / Minute", Parameters.StrikesPerMinute, 0.0f, 30.0f, "%.1f /min");
    Changed |= InspectorControls::ConstructSliderRow(Palette, Faces, "##LgtBrn", "Branching Factor", Parameters.BranchingFactor, 0.0f, 1.0f, "%.2f");
    Changed |= InspectorControls::ConstructSliderRow(Palette, Faces, "##LgtAmp", "Peak Current", Parameters.PeakCurrentKiloamps, 5.0f, 120.0f, "%.0f kA");
    Changed |= InspectorControls::ConstructSliderRow(Palette, Faces, "##LgtSheet", "Sheet Luminance", Parameters.CloudSheetLuminance, 0.0f, 10.0f, "%.2f");
    if (InspectorControls::ConstructActionButton(Palette, Faces, "##TriggerStrike", "Trigger Discharge"))
    {
        ++Parameters.TriggeredStrikeCount;
        Changed = true;
    }
    if (Changed)
    {
        Parameters.AdvanceRevision();
    }
}

#elif FRONTIER_EDITOR

void LightningInspector::EnumerateSwitches(std::vector<InspectorSwitchEntry>&) {}
void LightningInspector::ConstructInspector() {}

#endif

} // namespace Frontier
