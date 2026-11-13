/*==========================================================================================================================================
                                                        BAKINGWORKSPACESESSION.H
==========================================================================================================================================*/
// 🧪 Authoring session for Frontier Baking Studio: 18 PBR surface & 3D volume SDF targets, High/Low study pairs & raycaster settings.

#pragma once

//------------------------------------------------------------------------------------------------------------------------
//                                                        INCLUDES
//------------------------------------------------------------------------------------------------------------------------

#include "Engine/Components/PixelSpace.h"

#include <array>
#include <cstdint>
#include <string>
#include <string_view>

namespace Frontier::Workspaces
{

//------------------------------------------------------------------------------------------------------------------------
//                                                      ENUMERATIONS
//------------------------------------------------------------------------------------------------------------------------

enum class BakerTargetId : uint8_t
{
    VolumeSdf          = 0,
    TangentNormal      = 1,
    WorldNormal        = 2,
    ModelSpaceNormal       = 3,
    BentNormal         = 4,
    BevelNormal        = 5,
    AmbientOcclusion   = 6,
    SecondaryAo        = 7,
    Curvature          = 8,
    Convexity          = 9,
    Concavity          = 10,
    Thickness          = 11,
    HeightDisplacement = 12,
    TopDownDust        = 13,
    UvIslandId         = 14,
    PartMaterialId     = 15,
    WorldPosition      = 16,
    UvWireframe        = 17,
    Count              = 18,
};

enum class BakerTargetGroup : uint8_t
{
    VolumeAndDistance = 0,
    Normals           = 1,
    Surface           = 2,
    MasksAndIds       = 3,
    Count             = 4,
};

enum class BakerStudyShape : uint8_t
{
    UtahTeapot = 0,
    ShaderBall = 1,
    ChamferBox = 2,
    UvSphere   = 3,
    TorusKnot  = 4,
    Count      = 5,
};

enum class BakerViewportLayout : uint8_t
{
    ThreeDOnly = 0,
    TwoDOnly   = 1,
    SplitView  = 2,
    Count      = 3,
};

enum class BakerComputeDevice : uint8_t
{
    AutoGpu      = 0,
    WebGl2WebGpu = 1,
    CpuReference = 2,
    Count        = 3,
};

enum class TangentNormalConvention : uint8_t
{
    OpenGlPlusY  = 0,
    DirectXMinusY = 1,
    Count        = 2,
};

enum class VolumeSectionAxis : uint8_t
{
    AxisZ = 0,
    AxisY = 1,
    AxisX = 2,
    Count = 3,
};

enum class BakerQuickPreset : uint8_t
{
    PbrStandard       = 0,
    PbrPlusVolume = 1,
    Normals       = 2,
    SelectAll     = 3,
    Count         = 4,
};

//------------------------------------------------------------------------------------------------------------------------
//                                                       STRUCTURES
//------------------------------------------------------------------------------------------------------------------------

struct BakerTargetDescriptor
{
    BakerTargetId    Id           = BakerTargetId::TangentNormal;
    BakerTargetGroup Group        = BakerTargetGroup::Normals;
    const char*      Label        = "Tangent Normal";
    const char*      ShortSummary = "High-to-Low normal";
    bool             VolumeTarget = false;
};

struct BakerStudyDescriptor
{
    BakerStudyShape Study        = BakerStudyShape::UtahTeapot;
    const char*     Label        = "Utah Teapot (High/Low)";
    uint32_t        LowTris      = 16256u;
    uint32_t        HighTris     = 16256u;
};

//------------------------------------------------------------------------------------------------------------------------
//                                                  SESSION SPECIFICATION
//------------------------------------------------------------------------------------------------------------------------

struct BakingWorkspaceSession
{
    static constexpr std::size_t TargetCount = static_cast<std::size_t>(BakerTargetId::Count);

    BakerStudyShape         Study                   = BakerStudyShape::UtahTeapot;
    BakerViewportLayout     ViewportLayout          = BakerViewportLayout::ThreeDOnly;
    BakerComputeDevice     ComputeDevice          = BakerComputeDevice::AutoGpu;
    uint32_t                TargetResolutionPx      = 512u;
    TangentNormalConvention NormalConvention        = TangentNormalConvention::OpenGlPlusY;
    int32_t                 AoSampleCount           = 12;
    float                   FrontCageOffsetMeters   = 0.14f;
    float                   RearCageOffsetMeters    = 0.14f;
    float                   AoMaxRayDistanceMeters  = 0.45f;
    int32_t                 UvEdgePaddingPx         = 6;
    bool                    ShowHighWireOverlay     = false;

    uint32_t                VolumeGridDim           = 36u;
    bool                    SignedInteriorDistance  = true;
    float                   VolumeBoundsPadding     = 0.16f;
    VolumeSectionAxis       SectionAxis             = VolumeSectionAxis::AxisZ;
    float                   SectionDepthNormalized  = 0.50f;

    BakerTargetId           InspectedTarget         = BakerTargetId::TangentNormal;
    std::array<bool, TargetCount> SelectedTargets   {};
    std::array<bool, TargetCount> BakedReadyTargets {};

    bool                    BakingActive            = false;
    bool                    VolumeSdfBaked          = false;
    bool                    SurfaceBaked            = false;
    bool                    BridgedToPaint          = false;
    float                   BakeProgress            = 0.0f;
    std::string             ProgressStatus          = "Ready to bake";
    std::string             DeviceIndicatorText     = "WebGL2 GPU Ready";
    std::string             CustomLowAssetLabel     {};
    std::string             CustomHighAssetLabel    {};

    BakingWorkspaceSession() noexcept;

    void ResetDefaults() noexcept;
    void ApplyQuickPreset(BakerQuickPreset Preset) noexcept;
    void ToggleTargetSelected(BakerTargetId Target) noexcept;
    void InspectTarget(BakerTargetId Target) noexcept;
    void SelectStudy(BakerStudyShape NextStudy) noexcept;
    void AssignResolution(uint32_t NextResPx) noexcept;
    void AssignVolumeGridDim(uint32_t NextDim) noexcept;
    void ExecuteBakeSimulation() noexcept;
    void SendBakedTargetsToPaint() noexcept;

    [[nodiscard]] std::size_t CountSelectedTargets() const noexcept;
    [[nodiscard]] bool        QueryPresetMatched(BakerQuickPreset Preset) const noexcept;
    [[nodiscard]] bool        QueryTargetReady(BakerTargetId Target) const noexcept;
    [[nodiscard]] const BakerStudyDescriptor& QueryActiveStudyDescriptor() const noexcept;

    [[nodiscard]] static const std::array<BakerTargetDescriptor, TargetCount>& QueryTargetRegistry() noexcept;
    [[nodiscard]] static const BakerTargetDescriptor& QueryTargetDescriptor(BakerTargetId Target) noexcept;
    [[nodiscard]] static const std::array<BakerStudyDescriptor, 5u>& QueryStudyRegistry() noexcept;
    [[nodiscard]] static const char* QueryGroupHeading(BakerTargetGroup Group) noexcept;
};

} // namespace Frontier::Workspaces
