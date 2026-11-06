#pragma once
/*==========================================================================================================================================
                                                          FLUIDEDITORWORKSPACE.H
==========================================================================================================================================*/
// 🧩 1:1 C++ Interactive Fluid Editor ("Fluid — Frontier Experimental"), ported chrome-for-chrome and control-for-control
//    from Experimental/Fluid/{index.html, src/FluidPanel.js, src/FluidPanel.css, src/ThemeSpecification.css}.
//    Operates either standalone or opened directly from a selected smoke/fluid/plume in the Frontier Editor.

#include "Frontier/Engine/Editor/FluidEditorControls.h"
#include "Frontier/Engine/Editor/TypographyKit.h"
#include "Frontier/Engine/Rendering/VulkanContext.h"
#include "Frontier/Engine/VolumetricDynamics/GasSceneCodec.h"
#include "Frontier/Engine/VolumetricDynamics/PyroVolumeSolver.h"

#include <array>
#include <cstdint>
#include <string>
#include <vector>

namespace Frontier::FluidEditor
{

enum class SceneRole : uint8_t
{
    Domain   = 0,   // [-] - Eulerian volume
    Source   = 1,   // [-] - Continuous fire/smoke source
    Collider = 2,   // [-] - Signed-distance collider
    Sun      = 3,   // [-] - Directional light
};

enum class InspectorTab : uint8_t
{
    Source     = 0,
    Simulation = 1,
    Rendering  = 2,
};

enum class PresetCategoryFilter : uint8_t
{
    All   = 0,
    Fire  = 1,
    Smoke = 2,
    Blast = 3,
};

enum class ViewportTool : uint8_t
{
    Orbit = 0,
    Brush = 1,
    Burst = 2,
};

enum class CameraViewPreset : uint8_t
{
    Perspective = 0,
    Front       = 1,
    Side        = 2,
    Top         = 3,
};

struct OutlinerRow
{
    std::string Name    = "Gas domain";
    SceneRole   Role    = SceneRole::Domain;
    bool        Enabled = true;
    std::string Badge   = "";
};

struct FluidDocumentTab
{
    std::string                Title          = "Pyro plume";
    std::string                PresetIdentity = "ue5_pyro_default";
    GasSettings                Settings       = ConstructPresetSettings("ue5_pyro_default");
    GasSettings                SavedBaseline  = ConstructPresetSettings("ue5_pyro_default");
    PyroOrbitCamera            Camera{};
    std::vector<OutlinerRow>   Rows{};
    uint32_t                   SelectedRow    = 0u;
    bool                       Unsaved        = false;
};

struct WorkspaceLayout
{
    float OriginX      = 0.0f;
    float OriginY      = 0.0f;
    float Width        = 1280.0f;
    float Height       = 800.0f;

    float DocTop       = 54.0f;
    float WorkTop      = 90.0f;
    float StatusTop    = 774.0f;
    float WorkHeight   = 684.0f;

    bool  ShowOutliner = true;
    float LeftX        = 0.0f;
    float LeftW        = 236.0f;
    float CentreX      = 236.0f;
    float CentreW      = 734.0f;
    float RightX       = 970.0f;
    float RightW       = 310.0f;

    float CanvasTop     = 131.0f;
    float CanvasHeight  = 507.0f;
    float TransportTop = 638.0f;
    float TimelineTop  = 686.0f;
};

struct PaneRect
{
    float MinX = 0.0f;
    float MinY = 0.0f;
    float MaxX = 0.0f;
    float MaxY = 0.0f;

    [[nodiscard]] bool Contains(const ImVec2& Pt) const noexcept
    {
        return Pt.x >= MinX && Pt.x < MaxX && Pt.y >= MinY && Pt.y < MaxY;
    }
    [[nodiscard]] float Width() const noexcept { return MaxX - MinX; }
    [[nodiscard]] float Height() const noexcept { return MaxY - MinY; }
};

class FluidEditorWorkspace
{
  public:
    FluidEditorWorkspace();

    void BindFonts(ImFont* LightFont, ImFont* RegularFont) noexcept;
    void SetEmbeddedInFrontierEditor(bool Embedded) noexcept { EmbeddedInSceneEditor = Embedded; }

    // Bind an external plume's settings & solver (e.g. when clicking "Open FluidEditor" in Frontier Editor)
    void OpenForExternalDomain(const std::string& PlumeName, const std::string& PresetId,
                               GasSettings* ExternalSettings, PyroVolumeSolver* ExternalSolver);

    void LoadPresetByIdentity(VulkanContext& VkCtx, PyroVolumeSolver& ActiveSolver, const char* PresetId);
    bool LoadSampleSceneFile(VulkanContext& VkCtx, PyroVolumeSolver& ActiveSolver, const std::string& FilePath);
    bool SaveCurrentSceneToml(const std::string& FilePath);

    // Steps simulation (if playing or single-stepping), renders GPU viewport, and draws + handles full interactive UI.
    void TickAndDraw(VulkanContext& VkCtx, PyroVolumeSolver& FallbackSolver, float DtSeconds,
                     float MeasuredFps, const ImVec2& Origin, const ImVec2& Size);

    [[nodiscard]] bool ConsumeReturnToSceneRequest() noexcept;
    [[nodiscard]] const GasSettings& QueryActiveSettings() const noexcept;
    [[nodiscard]] GasSettings& AccessActiveSettings() noexcept;
    [[nodiscard]] const PyroOrbitCamera& QueryActiveCamera() const noexcept;
    [[nodiscard]] PyroOrbitCamera& AccessActiveCamera() noexcept;
    [[nodiscard]] const std::string& QueryStatusBanner() const noexcept { return LastActionBanner; }
    [[nodiscard]] const WorkspaceLayout& QueryLastLayout() const noexcept { return CachedLayout; }

  private:
    static WorkspaceLayout ComputeLayout(const ImVec2& Origin, const ImVec2& Size) noexcept;
    void InitializeDefaultRows(FluidDocumentTab& Doc, const GasSettings& Settings);
    void SyncRowsToSettings(FluidDocumentTab& Doc);
    PyroVolumeSolver& ResolveSolver(PyroVolumeSolver& FallbackSolver) noexcept;

    void HandleKeyboardShortcuts(VulkanContext& VkCtx, PyroVolumeSolver& Solver);
    void HandleViewportPointer(VulkanContext& VkCtx, PyroVolumeSolver& Solver, const PaneRect& CanvasRect);

    void DrawHeaderBar(ImDrawList* Draw, const WorkspaceLayout& Page, VulkanContext& VkCtx, PyroVolumeSolver& Solver);
    void DrawDocumentBar(ImDrawList* Draw, const WorkspaceLayout& Page, VulkanContext& VkCtx, PyroVolumeSolver& Solver);
    void DrawOutlinerAndPresetRail(ImDrawList* Draw, const WorkspaceLayout& Page, VulkanContext& VkCtx, PyroVolumeSolver& Solver);
    void DrawPresetGalleryOverlay(ImDrawList* Draw, const WorkspaceLayout& Page, VulkanContext& VkCtx, PyroVolumeSolver& Solver);
    void DrawCentreViewportAndTransport(ImDrawList* Draw, const WorkspaceLayout& Page, VulkanContext& VkCtx, PyroVolumeSolver& Solver);
    void DrawProjectedBoundsOverlay(ImDrawList* Draw, const PaneRect& CanvasRect, const GasSettings& Settings,
                                    const PyroBoundsBox& Bounds, const PyroCameraFrame& CamFrame);
    void DrawInspectorPane(ImDrawList* Draw, const WorkspaceLayout& Page, VulkanContext& VkCtx, PyroVolumeSolver& Solver);
    void DrawStatusBar(ImDrawList* Draw, const WorkspaceLayout& Page, VulkanContext& VkCtx, const PyroVolumeSolver& Solver, float Fps);
    void DrawActivePopupMenu(ImDrawList* Draw, VulkanContext& VkCtx, PyroVolumeSolver& Solver);

    ImFont*                       LightFace             = nullptr;
    ImFont*                       RegularFace           = nullptr;
    bool                          EmbeddedInSceneEditor = false;
    bool                          ReturnToSceneRequested= false;
    bool                          PresetsGalleryView    = false;
    bool                          ShortcutsHelpOpen     = false;

    std::vector<FluidDocumentTab> Documents{};
    size_t                        ActiveDocIndex        = 0u;
    GasSettings*                  BoundExternalSettings = nullptr;
    PyroVolumeSolver*             BoundExternalSolver   = nullptr;

    InspectorTab                  OpenTab               = InspectorTab::Source;
    PresetCategoryFilter          PresetFilter          = PresetCategoryFilter::All;
    uint32_t                      SceneRoleFilter       = 0u;   // 0=All, 1=Gas, 2=Geometry, 3=Lights
    ViewportTool                  ActiveTool            = ViewportTool::Orbit;
    CameraViewPreset              CameraView            = CameraViewPreset::Perspective;
    int                           BurstPatternIndex     = 0;    // 0=single, 1=salvo, 2=collide, 3=mushroom, 4=shrapnel

    float                         PresetRailScrollY     = 0.0f;
    float                         InspectorScrollY      = 0.0f;
    uint32_t                      GroupClosedMask[3]    = { 0b11000u, 0b1100u, 0b11110u }; // matches browser <details> open defaults

    std::string                   ActiveSliderKey       = "";
    bool                          DraggingViewport      = false;
    bool                          PanningViewport       = false;
    ImVec2                        PrevPointerPos        = { 0.0f, 0.0f };
    std::array<float, 3>          PrevBrushUvw          = { 0.5f, 0.3f, 0.5f };

    // Lightweight popup dropdown state (for choice selects, samples menu, burst pattern, speed, add object)
    std::string                   OpenPopupId           = "";
    ImVec2                        OpenPopupSpot         = { 0.0f, 0.0f };
    float                         OpenPopupWidth        = 180.0f;
    const ControlRow*             OpenChoiceControl     = nullptr;

    std::string                   LastActionBanner      = "";
    float                         BannerTimerSeconds    = 0.0f;
    WorkspaceLayout               CachedLayout{};
};

} // namespace Frontier::FluidEditor
