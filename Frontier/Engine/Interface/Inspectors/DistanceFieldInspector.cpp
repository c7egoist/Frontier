/*==========================================================================================================================================
                                                         DISTANCEFIELDINSPECTOR.CPP
==========================================================================================================================================*/
// 🧩 DistanceFieldConfiguration: the signed distance clipmap cascades.

#include "Engine/Interface/Inspectors/DistanceFieldInspector.h"

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

void DistanceFieldInspector::EnumerateSwitches(std::vector<InspectorSwitchEntry>& OutSwitches)
{
    OutSwitches.push_back({"Analytical SDF", "Exact primitives", &Parameters.AnalyticalPrimitives});
    OutSwitches.push_back({"Cascade Blend", "Trilinear seam", &Parameters.TrilinearCascadeBlend});
}

void DistanceFieldInspector::ConstructInspector()
{
    const InspectorPalette Palette = InspectorPalette::Resolve();
    const EditorTypefaces  Faces   = EditorTypefaces::Resolve();

    static const char* const CascadeTiers[4] = {
        "C3 Horizon Clipmap",
        "C2 Far Clipmap",
        "C1 Mid Clipmap",
        "C0 Near Clipmap",
    };
    DiagramControls::ConstructStrataPlot(Palette, Faces,
                                         ParseHexSpectrum("#1f3a52", Palette.InsetFieldBg),
                                         ParseHexSpectrum("#2f6f62", Palette.LiveGreen),
                                         CascadeTiers, 4);

    bool Changed = false;
    Changed |= InspectorControls::ConstructSliderRow(Palette, Faces, "##C0Rad", "Cascade 0 Radius", Parameters.CascadeZeroRadiusMetres, 4.0f, 32.0f, "%.0f m");
    Changed |= InspectorControls::ConstructSliderRow(Palette, Faces, "##C1Rad", "Cascade 1 Radius", Parameters.CascadeOneRadiusMetres, 16.0f, 96.0f, "%.0f m");
    Changed |= InspectorControls::ConstructSliderRow(Palette, Faces, "##C2Rad", "Cascade 2 Radius", Parameters.CascadeTwoRadiusMetres, 64.0f, 256.0f, "%.0f m");
    Changed |= InspectorControls::ConstructSliderRow(Palette, Faces, "##C3Rad", "Cascade 3 Radius", Parameters.CascadeThreeRadiusMetres, 128.0f, 640.0f, "%.0f m");
    Changed |= InspectorControls::ConstructIntegerSliderRow(Palette, Faces, "##ConeSteps", "Max Cone Steps", Parameters.MaxConeSteps, 8u, 128u);
    Changed |= InspectorControls::ConstructSliderRow(Palette, Faces, "##ConeScale", "Step Scale", Parameters.ConeTraceStepScale, 0.25f, 2.0f, "%.2f");
    if (Changed)
    {
        Parameters.AdvanceRevision();
    }
}

#elif FRONTIER_EDITOR

void DistanceFieldInspector::EnumerateSwitches(std::vector<InspectorSwitchEntry>&) {}
void DistanceFieldInspector::ConstructInspector() {}

#endif

} // namespace Frontier
