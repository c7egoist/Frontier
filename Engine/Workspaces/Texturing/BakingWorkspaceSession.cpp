/*==========================================================================================================================================
                                                       BAKINGWORKSPACESESSION.CPP
==========================================================================================================================================*/
// 🧪 Implementation of BakingWorkspaceSession presets, 18 surface/volume target metadata, High/Low study descriptors & bake execution.

#include "Engine/Workspaces/Texturing/BakingWorkspaceSession.h"

#include <cstdio>

namespace Frontier::Workspaces
{

namespace
{

constexpr std::array<BakerTargetDescriptor, BakingWorkspaceSession::TargetCount> BakerTargetEntries {{
    { BakerTargetId::VolumeSdf,          BakerTargetGroup::VolumeAndDistance, "Volume SDF",            "3D distance grid",     true  },
    { BakerTargetId::TangentNormal,      BakerTargetGroup::Normals,           "Tangent Normal",        "High-to-Low normal",   false },
    { BakerTargetId::WorldNormal,        BakerTargetGroup::Normals,           "World Normal",          "Scene XYZ vector",     false },
    { BakerTargetId::ModelSpaceNormal,       BakerTargetGroup::Normals,           "Object Normal",         "Local XYZ vector",     false },
    { BakerTargetId::BentNormal,         BakerTargetGroup::Normals,           "Bent Normal",           "Average unoccluded ray", false },
    { BakerTargetId::BevelNormal,        BakerTargetGroup::Normals,           "Bevel Normal",          "Rounded edge filter",  false },
    { BakerTargetId::AmbientOcclusion,   BakerTargetGroup::Surface,           "Ambient Occlusion",     "Hemisphere sky AO",    false },
    { BakerTargetId::SecondaryAo,        BakerTargetGroup::Surface,           "Secondary AO",          "Tight contact creases",false },
    { BakerTargetId::Curvature,          BakerTargetGroup::Surface,           "Curvature",             "Ridge & cavity signed",false },
    { BakerTargetId::Convexity,          BakerTargetGroup::Surface,           "Convexity",             "Positive ridges",      false },
    { BakerTargetId::Concavity,          BakerTargetGroup::Surface,           "Concavity",             "Recessed grooves",     false },
    { BakerTargetId::Thickness,          BakerTargetGroup::Surface,           "Thickness",             "Interior ray depth",   false },
    { BakerTargetId::HeightDisplacement, BakerTargetGroup::Surface,           "Height / Displacement", "Cage ray offset",      false },
    { BakerTargetId::TopDownDust,        BakerTargetGroup::MasksAndIds,       "Top-Down Dust",         "Directional overlay",  false },
    { BakerTargetId::UvIslandId,         BakerTargetGroup::MasksAndIds,       "UV Island ID",          "Chart color index",    false },
    { BakerTargetId::PartMaterialId,     BakerTargetGroup::MasksAndIds,       "Part / Material ID",    "Sub-surface ID color", false },
    { BakerTargetId::WorldPosition,      BakerTargetGroup::MasksAndIds,       "World Position",        "Normalized XYZ bbox",  false },
    { BakerTargetId::UvWireframe,        BakerTargetGroup::MasksAndIds,       "UV Wireframe",          "Edge triangle overlay",false },
}};

constexpr std::array<BakerStudyDescriptor, 5u> BakerStudyEntries {{
    { BakerStudyShape::UtahTeapot, "Utah Teapot (High/Low)", 16256u, 16256u },
    { BakerStudyShape::ShaderBall, "Shader Ball (High/Low)", 23040u, 23040u },
    { BakerStudyShape::ChamferBox, "Chamfer Box (High/Low)",   648u,  2400u },
    { BakerStudyShape::UvSphere,   "UV Sphere (High/Low)",    6144u,  7776u },
    { BakerStudyShape::TorusKnot,  "Torus Knot Study",        1296u,  9216u },
}};

} // namespace

BakingWorkspaceSession::BakingWorkspaceSession() noexcept
{
    ResetDefaults();
}

void BakingWorkspaceSession::ResetDefaults() noexcept
{
    Study                  = BakerStudyShape::UtahTeapot;
    ViewportLayout         = BakerViewportLayout::ThreeDOnly;
    ComputeDevice         = BakerComputeDevice::AutoGpu;
    TargetResolutionPx     = 512u;
    NormalConvention       = TangentNormalConvention::OpenGlPlusY;
    AoSampleCount          = 12;
    FrontCageOffsetMeters  = 0.14f;
    RearCageOffsetMeters   = 0.14f;
    AoMaxRayDistanceMeters = 0.45f;
    UvEdgePaddingPx        = 6;
    ShowHighWireOverlay    = false;

    VolumeGridDim          = 36u;
    SignedInteriorDistance = true;
    VolumeBoundsPadding    = 0.16f;
    SectionAxis            = VolumeSectionAxis::AxisZ;
    SectionDepthNormalized = 0.50f;

    InspectedTarget        = BakerTargetId::TangentNormal;
    BakedReadyTargets.fill(false);
    BakingActive           = false;
    VolumeSdfBaked         = false;
    SurfaceBaked           = false;
    BridgedToPaint         = false;
    BakeProgress           = 0.0f;
    ProgressStatus         = "Ready to bake";
    DeviceIndicatorText    = "WebGL2 GPU Ready";
    CustomLowAssetLabel.clear();
    CustomHighAssetLabel.clear();

    ApplyQuickPreset(BakerQuickPreset::PbrPlusVolume);
}

void BakingWorkspaceSession::ApplyQuickPreset(BakerQuickPreset Preset) noexcept
{
    SelectedTargets.fill(false);
    if (Preset == BakerQuickPreset::PbrStandard)
    {
        SelectedTargets[static_cast<std::size_t>(BakerTargetId::TangentNormal)]      = true;
        SelectedTargets[static_cast<std::size_t>(BakerTargetId::AmbientOcclusion)]   = true;
        SelectedTargets[static_cast<std::size_t>(BakerTargetId::Curvature)]          = true;
        SelectedTargets[static_cast<std::size_t>(BakerTargetId::HeightDisplacement)] = true;
    }
    else if (Preset == BakerQuickPreset::PbrPlusVolume)
    {
        SelectedTargets[static_cast<std::size_t>(BakerTargetId::VolumeSdf)]          = true;
        SelectedTargets[static_cast<std::size_t>(BakerTargetId::TangentNormal)]      = true;
        SelectedTargets[static_cast<std::size_t>(BakerTargetId::AmbientOcclusion)]   = true;
        SelectedTargets[static_cast<std::size_t>(BakerTargetId::Curvature)]          = true;
        SelectedTargets[static_cast<std::size_t>(BakerTargetId::HeightDisplacement)] = true;
    }
    else if (Preset == BakerQuickPreset::Normals)
    {
        SelectedTargets[static_cast<std::size_t>(BakerTargetId::TangentNormal)] = true;
        SelectedTargets[static_cast<std::size_t>(BakerTargetId::WorldNormal)]   = true;
        SelectedTargets[static_cast<std::size_t>(BakerTargetId::BentNormal)]    = true;
        SelectedTargets[static_cast<std::size_t>(BakerTargetId::BevelNormal)]   = true;
    }
    else
    {
        SelectedTargets.fill(true);
    }
}

void BakingWorkspaceSession::ToggleTargetSelected(BakerTargetId Target) noexcept
{
    const std::size_t Index = static_cast<std::size_t>(Target);
    if (Index < SelectedTargets.size())
    {
        SelectedTargets[Index] = !SelectedTargets[Index];
    }
}

void BakingWorkspaceSession::InspectTarget(BakerTargetId Target) noexcept
{
    if (static_cast<std::size_t>(Target) < TargetCount)
    {
        InspectedTarget = Target;
    }
}

void BakingWorkspaceSession::SelectStudy(BakerStudyShape NextStudy) noexcept
{
    if (static_cast<std::size_t>(NextStudy) < BakerStudyEntries.size())
    {
        Study          = NextStudy;
        SurfaceBaked   = false;
        VolumeSdfBaked = false;
        BakedReadyTargets.fill(false);
        BakeProgress   = 0.0f;
        ProgressStatus = "Ready to bake";
    }
}

void BakingWorkspaceSession::AssignResolution(uint32_t NextResPx) noexcept
{
    if (NextResPx == 256u || NextResPx == 512u || NextResPx == 1024u || NextResPx == 2048u)
    {
        TargetResolutionPx = NextResPx;
    }
}

void BakingWorkspaceSession::AssignVolumeGridDim(uint32_t NextDim) noexcept
{
    if (NextDim == 24u || NextDim == 36u || NextDim == 48u || NextDim == 64u)
    {
        VolumeGridDim = NextDim;
    }
}

void BakingWorkspaceSession::ExecuteBakeSimulation() noexcept
{
    std::size_t AnySelected = 0u;
    bool        AnySurface  = false;
    bool        WantVolume  = false;
    for (std::size_t I = 0u; I < TargetCount; ++I)
    {
        if (!SelectedTargets[I])
        {
            continue;
        }
        ++AnySelected;
        BakedReadyTargets[I] = true;
        if (I == static_cast<std::size_t>(BakerTargetId::VolumeSdf))
        {
            WantVolume = true;
        }
        else
        {
            AnySurface = true;
        }
    }
    if (AnySelected == 0u)
    {
        ProgressStatus = "Select at least one bake target";
        BakeProgress   = 0.0f;
        return;
    }

    if (AnySurface)
    {
        SurfaceBaked = true;
    }
    if (WantVolume)
    {
        VolumeSdfBaked = true;
    }
    if (!SelectedTargets[static_cast<std::size_t>(InspectedTarget)])
    {
        for (std::size_t I = 0u; I < TargetCount; ++I)
        {
            if (SelectedTargets[I])
            {
                InspectedTarget = static_cast<BakerTargetId>(I);
                break;
            }
        }
    }

    BakeProgress = 1.0f;
    char Buf[96];
    const char* DeviceTag = (ComputeDevice == BakerComputeDevice::CpuReference) ? "CPU Reference" : "WebGL2 GPU";
    std::snprintf(Buf, sizeof(Buf), "Done · %s · %zu maps", DeviceTag, AnySelected);
    ProgressStatus      = Buf;
    DeviceIndicatorText = (ComputeDevice == BakerComputeDevice::CpuReference) ? "CPU Reference" : "WebGL2 GPU · 42 ms";
}

void BakingWorkspaceSession::SendBakedTargetsToPaint() noexcept
{
    if (SurfaceBaked)
    {
        BridgedToPaint = true;
        ProgressStatus = "Sent Baked AO / Curvature / Normals to Texture Paint";
    }
}

std::size_t BakingWorkspaceSession::CountSelectedTargets() const noexcept
{
    std::size_t Total = 0u;
    for (bool Selected : SelectedTargets)
    {
        if (Selected)
        {
            ++Total;
        }
    }
    return Total;
}

bool BakingWorkspaceSession::QueryPresetMatched(BakerQuickPreset Preset) const noexcept
{
    BakingWorkspaceSession InspectSession;
    InspectSession.ApplyQuickPreset(Preset);
    return InspectSession.SelectedTargets == SelectedTargets;
}

bool BakingWorkspaceSession::QueryTargetReady(BakerTargetId Target) const noexcept
{
    const std::size_t Index = static_cast<std::size_t>(Target);
    return (Index < BakedReadyTargets.size()) && BakedReadyTargets[Index];
}

const BakerStudyDescriptor& BakingWorkspaceSession::QueryActiveStudyDescriptor() const noexcept
{
    const std::size_t Index = static_cast<std::size_t>(Study);
    return BakerStudyEntries[Index < BakerStudyEntries.size() ? Index : 0u];
}

const std::array<BakerTargetDescriptor, BakingWorkspaceSession::TargetCount>& BakingWorkspaceSession::QueryTargetRegistry() noexcept
{
    return BakerTargetEntries;
}

const BakerTargetDescriptor& BakingWorkspaceSession::QueryTargetDescriptor(BakerTargetId Target) noexcept
{
    const std::size_t Index = static_cast<std::size_t>(Target);
    return BakerTargetEntries[Index < TargetCount ? Index : 1u];
}

const std::array<BakerStudyDescriptor, 5u>& BakingWorkspaceSession::QueryStudyRegistry() noexcept
{
    return BakerStudyEntries;
}

const char* BakingWorkspaceSession::QueryGroupHeading(BakerTargetGroup Group) noexcept
{
    switch (Group)
    {
        case BakerTargetGroup::VolumeAndDistance: return "Volume & Distance";
        case BakerTargetGroup::Normals:           return "Normals";
        case BakerTargetGroup::Surface:           return "Surface";
        case BakerTargetGroup::MasksAndIds:       return "Masks & IDs";
        default:                                  return "Surface";
    }
}

} // namespace Frontier::Workspaces
