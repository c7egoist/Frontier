#pragma once
/*==========================================================================================================================================
                                                         FRONTIEREDITORWORKSPACE.H
==========================================================================================================================================*/
// 🧩 Native C++ Frontier Editor workspace (Outliner · 3D GPU SDF Viewport · Inspector · StatusBar) ported from
//    Experimental/VehicleHmiPrototype/Source/{EditorShell.js, InspectorPages.js} and GasCardSurface.h,
//    integrated 1:1 with FluidEditorWorkspace, WorldSdfScene, LobbySession, and TyreSmokeIntake.

#include "Frontier/Engine/Editor/FluidEditorWorkspace.h"
#include "Frontier/Engine/Rendering/VulkanContext.h"
#include "Frontier/Engine/Rendering/WorldSdfScene.h"
#include "Frontier/Engine/Scene/FacetArchive.h"
#include "Frontier/Engine/Session/LobbySession.h"
#include "Frontier/Engine/VolumetricDynamics/PyroVolumeSolver.h"
#include "Frontier/Engine/VolumetricDynamics/TyreSmokeIntake.h"
#include "Frontier/Game/CameraController.h"
#include "Projects/Everest/Source/Navigation/NavigationApp.h"

#include <array>
#include <cstdint>
#include <memory>
#include <string>
#include <vector>

namespace Frontier
{

struct WorldPlumeInstance
{
    std::string                        Id             = "plume_0";
    std::string                        Name           = "Camp fire plume";
    std::string                        PresetIdentity = "camp_fire";
    std::array<float, 3>               OriginWorld    = { 5.2f, 2.55f, 0.0f };   // [m] - Frontier Z-up anchor
    bool                               Visible        = true;
    bool                               SdfCollision   = true;
    bool                               VehicleWake    = true;
    bool                               FollowsVehicle = false;
    GasSettings                        Settings{};
    GasSettings                        PresetBaseline{};
    std::unique_ptr<PyroVolumeSolver>  Solver{};
    std::vector<float>                 SdfScratch{};
    uint32_t                           SdfRefreshTick = 0u;
};

enum class SelectedSubjectCategory : uint8_t
{
    Plume       = 0,
    Environment = 1,
    Vehicle     = 2,
    Level       = 3,
};

class FrontierEditorWorkspace
{
  public:
    FrontierEditorWorkspace() = default;
    ~FrontierEditorWorkspace() = default;

    FrontierEditorWorkspace(const FrontierEditorWorkspace&)            = delete;
    FrontierEditorWorkspace& operator=(const FrontierEditorWorkspace&) = delete;

    bool Initialize(VulkanContext& VkCtx, const FacetArchiveData* Body, const FacetArchiveData* Tyre,
                    const FacetArchiveData* Rim, std::string& OutDiagnostic);
    void Shutdown(VulkanContext& VkCtx) noexcept;

    void LoadDefaultFonts();

    void OpenFluidEditorForPlume(size_t PlumeIndex);
    void CloseFluidEditor() noexcept { FluidEditorOpen = false; }

    void TickAndDraw(VulkanContext& VkCtx, LobbySession& Game, Everest::NavigationApp& Navigation,
                     CameraController& Camera, float DtSeconds, float MeasuredFps,
                     const ImVec2& WindowOrigin, const ImVec2& WindowSize);

    [[nodiscard]] bool IsFluidEditorOpen() const noexcept { return FluidEditorOpen; }
    [[nodiscard]] bool AreSidePanelsVisible() const noexcept { return SidePanelsVisible; }
    [[nodiscard]] bool WantsVehicleDrivingInput() const noexcept;

    [[nodiscard]] FluidEditor::FluidEditorWorkspace& AccessFluidEditor() noexcept { return FluidWorkspace; }
    [[nodiscard]] WorldSdfScene& AccessWorldScene() noexcept { return SdfWorld; }
    [[nodiscard]] TyreSmokeIntake& AccessTyreIntake() noexcept { return TyreIntake; }
    [[nodiscard]] std::vector<WorldPlumeInstance>& AccessPlumes() noexcept { return Plumes; }
    [[nodiscard]] const std::vector<WorldPlumeInstance>& QueryPlumes() const noexcept { return Plumes; }
    [[nodiscard]] size_t QuerySelectedPlumeIndex() const noexcept { return SelectedPlumeIndex; }

    void SelectPlume(size_t PlumeIndex) noexcept;
    void SetBurnoutLineLock(bool Enabled) noexcept { TyreIntake.BurnoutLineLock = Enabled; }

  private:
    bool SpawnWorldPlume(VulkanContext& VkCtx, const std::string& Name, const char* PresetId,
                         const std::array<float, 3>& OriginWorld, bool FollowsVehicle, std::string& OutDiagnostic);

    void UpdateWorldSimulation(VulkanContext& VkCtx, LobbySession& Game, const CameraController& Camera,
                               float DtSeconds, int ViewportW, int ViewportH);

    void DrawFrontierOutliner(ImDrawList* Draw, const FluidEditor::PaneRect& Pane,
                              LobbySession& Game, Everest::NavigationApp& Navigation, VulkanContext& VkCtx);
    void DrawFrontierViewport(ImDrawList* Draw, const FluidEditor::PaneRect& Pane,
                              LobbySession& Game, Everest::NavigationApp& Navigation,
                              CameraController& Camera, VulkanContext& VkCtx);
    void DrawFrontierInspector(ImDrawList* Draw, const FluidEditor::PaneRect& Pane,
                               LobbySession& Game, VulkanContext& VkCtx);
    void DrawGasCardInspector(ImDrawList* Draw, const FluidEditor::PaneRect& ScrollBox,
                              WorldPlumeInstance& Plume, size_t PlumeIndex, VulkanContext& VkCtx);
    void DrawStatusStrip(ImDrawList* Draw, const FluidEditor::PaneRect& Bar,
                         const LobbySession& Game, VulkanContext& VkCtx, float MeasuredFps);
    void DrawPopupOverlay(ImDrawList* Draw, VulkanContext& VkCtx, const FluidEditor::PaneRect& FullRect);

    ImFont*                               LightFont           = nullptr;
    ImFont*                               RegularFont         = nullptr;

    WorldSdfScene                         SdfWorld{};
    TyreSmokeIntake                       TyreIntake{};
    WorldEnvironmentLight                 Environment{};
    std::vector<WorldPlumeInstance>       Plumes{};
    PyroVolumeSolver                      StandaloneFallbackSolver{};
    FluidEditor::FluidEditorWorkspace     FluidWorkspace{};

    bool                                  FluidEditorOpen     = false;
    bool                                  SidePanelsVisible   = true;
    bool                                  SdfObstaclesEnabled = true;
    bool                                  ShowSelectedBounds  = true;

    SelectedSubjectCategory               SelectedCategory    = SelectedSubjectCategory::Plume;
    size_t                                SelectedPlumeIndex  = 0u;   // default selected: Tyre smoke & fire or Camp fire
    bool                                  GroupCollapsed[4]   = { false, false, false, false };

    float                                 OutlinerScrollY     = 0.0f;
    float                                 InspectorScrollY    = 0.0f;
    std::string                           ActiveDragKey       = "";
    bool                                  OrbitingSceneView   = false;
    ImVec2                                PrevSceneMouse      = { 0.0f, 0.0f };
    WorldCameraView                       LatestWorldCam{};

    std::string                           PopupId             = "";
    ImVec2                                PopupSpot           = { 0.0f, 0.0f };
    float                                 PopupWidth          = 200.0f;
    float                                 PopupScrollY        = 0.0f;

    std::array<float, 3>                  PrevCarPos          = { 0.0f, 0.0f, 0.53f };
    float                                 PrevCarYaw          = 0.0f;
    bool                                  HasPrevCar          = false;
    std::array<float, 3>                  VehiclePaintRgb     = { 0.22f, 0.24f, 0.27f };
    VehicleInspection                     VehicleInspect{};
    bool                                  Initialized         = false;
};

} // namespace Frontier
