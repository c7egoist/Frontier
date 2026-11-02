/*==========================================================================================================================================
                                                              FOGINSPECTOR.CPP
==========================================================================================================================================*/
// 🧩 FogConfiguration: height fog and bounded local fog.

#include "Engine/Interface/Inspectors/FogInspector.h"

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

void FogInspector::EnumerateSwitches(std::vector<InspectorSwitchEntry>& OutSwitches)
{
    OutSwitches.push_back({"Local Volume", "Bounded box", &Parameters.LocalVolume});
    OutSwitches.push_back({"Froxel Grid", "Camera frustum", &Parameters.VolumetricFroxelGrid});
    OutSwitches.push_back({"Ray Shadows", "Sun shafts", &Parameters.ReceiveRayShadow});
}

void FogInspector::ConstructInspector()
{
    const InspectorPalette Palette = InspectorPalette::Resolve();
    const EditorTypefaces  Faces   = EditorTypefaces::Resolve();

    std::array<float, 32> ExtinctionSamples{};
    for (size_t Index = 0; Index < ExtinctionSamples.size(); ++Index)
    {
        const float HeightMetres = static_cast<float>(Index) * 4.0f;
        ExtinctionSamples[Index] = std::exp(-Parameters.HeightFalloff * HeightMetres * 0.25f) *
                                   std::clamp(Parameters.BaseDensity * 35.0f, 0.05f, 1.0f);
    }
    char FogHeader[64]{};
    std::snprintf(FogHeader, sizeof(FogHeader), "EXPONENTIAL EXTINCTION · sigma=%.3f", Parameters.BaseDensity);
    DiagramControls::ConstructCurvePlot(Palette, Faces, FogHeader,
                                        ExtinctionSamples.data(), ExtinctionSamples.size(),
                                        ParseHexSpectrum("#7db8d6", Palette.ThemeAccent));

    bool Changed = false;
    Changed |= InspectorControls::ConstructSliderRow(Palette, Faces, "##FogDens", "Base Density", Parameters.BaseDensity, 0.0f, 0.12f, "%.4f");
    Changed |= InspectorControls::ConstructSliderRow(Palette, Faces, "##FogFall", "Height Falloff", Parameters.HeightFalloff, 0.01f, 1.0f, "%.2f");
    Changed |= InspectorControls::ConstructSliderRow(Palette, Faces, "##FogAniso", "Phase Anisotropy", Parameters.PhaseAnisotropy, -0.8f, 0.95f, "%.2f");
    Changed |= InspectorControls::ConstructSliderRow(Palette, Faces, "##FogStart", "Start Distance", Parameters.StartDistanceMetres, 0.0f, 100.0f, "%.1f m");
    if (Changed)
    {
        Parameters.AdvanceRevision();
    }
}

#elif FRONTIER_EDITOR

void FogInspector::EnumerateSwitches(std::vector<InspectorSwitchEntry>&) {}
void FogInspector::ConstructInspector() {}

#endif

} // namespace Frontier
