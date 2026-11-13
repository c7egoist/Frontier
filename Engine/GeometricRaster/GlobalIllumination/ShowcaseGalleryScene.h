/*==========================================================================================================================================
                                                   SHOWCASEGALLERYSCENE.H
==========================================================================================================================================*/
// 🧩 Canonical Architectural Cornell-Studio Gallery World Scene, EditorCamera, and OutlinerPanel bidirectional registration

#pragma once

//------------------------------------------------------------------------------------------------------------------------
//                                                        INCLUDES
//------------------------------------------------------------------------------------------------------------------------

#include "Engine/Components/Panes/OutlinerPanel.h"
#include "Engine/GeometricRaster/GlobalIllumination/TieredWorldRenderSequence.h"
#include "Engine/GeometrySpace/Network/PolygonNetwork.h"

#include <array>
#include <cstdint>
#include <string>
#include <vector>

namespace Frontier::GeometricRaster
{

//------------------------------------------------------------------------------------------------------------------------
//                                                       STRUCTURES
//------------------------------------------------------------------------------------------------------------------------

struct ShowcaseGeometryAsset
{
    GeometrySpace::PolygonNetwork       Network {}; // [-] - Authored polygon network primitive
    SpatialAcceleration::ClusterPyramid Pyramid {}; // [-] - Built 3-level cluster hierarchy
};

struct ShowcaseWorldObjectEntry
{
    std::string                 Title                {};    // [-]   - Outliner & HTML mirror object title
    std::string                 StableIdentifier     {};    // [-]   - 1:1 HTML mirror row identifier
    std::string                 MaterialTitle        {};    // [-]   - Assigned OpenPBR material identifier
    std::string                 Subtitle             {};    // [-]   - Outliner secondary summary caption
    std::string                 AuthorNotes          {};    // [-]   - Authored inspector documentation
    Mathematics::Axis3D         CenterWorld          {};    // [m]   - World-space center coordinate
    Mathematics::Scalar3D       DimensionsMeters     {};    // [m]   - Full X/Y/Z extent in meters
    uint16_t                    MaterialSlot         = 0u;  // [idx] - CompactMaterialRegister slot
    uint32_t                    ClusterInstanceIndex = 0u;  // [idx] - Index in Scene.ClusterInstances
    bool                        GlassShell           = false; // [-] - True for 2-layer Abbe glass peel
    bool                        SphericalPrimitive   = false; // [-] - Sphere vs box primitive marker
    OutlinerSlotToken           SlotToken            {};    // [id]  - Registered OutlinerPanel slot token
};

struct ShowcaseWorldSceneBundle
{
    std::array<ShowcaseGeometryAsset, 8u> GeometryAssets      {}; // [-]   - Persistent cluster pyramid owners
    WorldSceneSpecification               Scene               {}; // [-]   - Complete world scene specification
    PerspectiveCameraFrame                EditorCamera        {}; // [-]   - Canonical EditorCamera navigation frame
    std::vector<ShowcaseWorldObjectEntry> Objects             {}; // [-]   - 10 registered gallery geometry objects

    OutlinerSlotToken                     ShowcaseFolderToken {}; // [id]  - "Showcase" collection folder token
    OutlinerSlotToken                     CamerasFolderToken  {}; // [id]  - "Cameras" collection folder token
    OutlinerSlotToken                     WorldFolderToken    {}; // [id]  - "World" collection folder token
    OutlinerSlotToken                     LightingFolderToken {}; // [id]  - "Lighting" collection folder token
    OutlinerSlotToken                     EditorCameraToken   {}; // [id]  - "Editor Camera" entry token
    OutlinerSlotToken                     SunEmitterToken     {}; // [id]  - "Sun" directional emitter token
    OutlinerSlotToken                     CeilingSoftboxToken {}; // [id]  - "Ceiling Softbox" LTC quad light token
};

//------------------------------------------------------------------------------------------------------------------------
//                                                  FUNCTION PROTOTYPES
//------------------------------------------------------------------------------------------------------------------------

// Constructs the canonical Architectural Cornell-Studio Gallery World Scene and EditorCamera (1:1 with HTML mirror)
void BuildShowcaseGalleryScene(
    ShowcaseWorldSceneBundle& OutBundle,
    uint32_t                  ViewportWidthPx  = 640u,
    uint32_t                  ViewportHeightPx = 336u);

// Registers all Showcase Gallery folders, 10 geometry objects, EditorCamera, Sun, and Ceiling Softbox in OutlinerPanel
void RegisterShowcaseGalleryInOutliner(
    OutlinerPanel&            TargetOutliner,
    ShowcaseWorldSceneBundle& InOutBundle);

// Synchronizes OutlinerPanel visibility, shadow-caster flags, and transforms back into ShowcaseWorldSceneBundle
bool SynchronizeShowcaseGalleryFromOutliner(
    const OutlinerPanel&      SourceOutliner,
    ShowcaseWorldSceneBundle& InOutBundle);

} // namespace Frontier::GeometricRaster
