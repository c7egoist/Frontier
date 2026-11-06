#pragma once
/*==========================================================================================================================================
                                                          FLUIDPLUMEEDITOR.H
==========================================================================================================================================*/
// 🧩 C++ of EditorShell.js + InspectorPages.BuildGas: outliner row "Smoke & fire", inspector cards Domain /
//    Source / Simulation / Appearance / Fire / Presets. Selecting smoke / fluid / plume opens this inspector.

#include "Frontier/Engine/VolumetricDynamics/GasParameters.h"
#include "Frontier/Engine/VolumetricDynamics/PlumeSourceProjection.h"
#include "Frontier/Engine/VolumetricDynamics/PlumeSpace.h"
#include "Frontier/Game/SoftwarePresentation.h"

#include <array>
#include <cstdint>
#include <string>
#include <vector>

namespace Frontier
{

struct EditorEntity
{
    const char* Id = "";
    const char* Group = "";
    const char* Name = "";
    const char* Type = "";
    const char* Description = "";
    std::array<uint8_t, 3> Colour{ 232, 131, 58 };
    bool Toggle = false;
};

struct FluidPlumeSettings
{
    bool SmokeEnabled = true;
    int  TestPlume = 0;       // 0 off, 1 smoke, 2 fire — InspectorPages TestPlume
    int  IgnitionMode = 0;    // 0 authored, 1 diagnostic, 2 off
    int  GradeIndex = 0;      // Low for CPU; exhibit default is High (2)
    GasParameters Gas;
};

class FluidPlumeEditor
{
public:
    FluidPlumeEditor();

    void Select(const char* Id);
    bool SelectByQuery(const char* Query);
    void ToggleSelected();
    void ApplyPreset(const char* Name);
    void ClearSmoke();
    void AssignSlider(GasParameter Id, float Scalar);
    void AssignTestPlume(int Mode);
    bool Hit(int X, int Y);
    void Advance(float Seconds, PlumeVec3 VehiclePosition, PlumeVec3 Forward);
    [[nodiscard]] PresentationFrame Raster(int Width, int Height);
    void CompositeViewport(PresentationFrame& Frame, int ViewX, int ViewY, int ViewW, int ViewH);

    FluidPlumeSettings Settings;
    PlumeSpace Space;
    PlumeSourceProjection Sources;
    SceneDistanceField Distance;
    std::string Selected = "gas";
    std::vector<EditorEntity> Entities;
    int InspectorScroll = 0;

private:
    struct HitRect { int X, Y, W, H; int Kind; int Payload; };
    std::vector<HitRect> Hits;
};

[[nodiscard]] PresentationFrame RasterFluidPlumeEditor(FluidPlumeEditor& Editor, int Width = 1280, int Height = 720);
bool WritePpm(const std::string& Path, const PresentationFrame& Frame);

} // namespace Frontier
