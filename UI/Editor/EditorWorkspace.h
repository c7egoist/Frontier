/*==========================================================================================================================================
                                                        EDITORWORKSPACE.H
==========================================================================================================================================*/
// 🧩 Adapt existing editor-owned content to one shared docked/detached host without constructing duplicate panel instances.

#pragma once
#include "ControlCentrePanel.h"
#include "Engine/Interface/LogStreamPanel.h"
#include "Engine/Interface/PanelDockspace.h"
#include "Engine/Interface/SceneDirectoryPanel.h"
#include "Engine/Interface/SceneInspectorPanel.h"
#include "Engine/Scene/RecordEntry.h"
#include "Engine/Scene/SceneRecord.h"
#include <filesystem>
#include <functional>
#include <memory>
#include <string>
#include <vector>

namespace Frontier
{
struct EditorProjectSummary
{
    std::string Name     = "Untitled project";
    std::string Location;
    std::string Identity;
    std::string ApplicationTarget = "Frontier · Project workspace";
    size_t      Levels   = 0;
    size_t      Roots    = 0;
    size_t      Catalogue = 0;
    std::string StartupLevel;
};
class EditorWorkspace
{
  public:
    explicit EditorWorkspace(ControlCentrePanel &ControlCentre);
    ~EditorWorkspace();
    EditorWorkspace(const EditorWorkspace &)              = delete;
    EditorWorkspace   &operator=(const EditorWorkspace &) = delete;
    void ConfigureProject(EditorProjectSummary Summary) { Project = std::move(Summary); }
    [[nodiscard]] const EditorProjectSummary &QueryProject() const noexcept { return Project; }
    void ActivateProjectWorkspace(const std::filesystem::path &ProjectPath, bool NotchBandComposition = true);
    [[nodiscard]] LogStreamPanel &QueryLogStreamPanel() noexcept { return LogPanel; }
    [[nodiscard]] SceneDirectoryPanel &QuerySceneDirectoryPanel() noexcept { return OutlinerPanel; }
    [[nodiscard]] SceneInspectorPanel &QuerySceneInspectorPanel() noexcept { return InspectorPanel; }
    std::function<void()> EvaluateReturnToBrowser;
    bool               FinalizeLayout();
    void               IntegrateLayoutPersistence(double ElapsedSeconds);
    [[nodiscard]] bool QueryLayoutRestored() const noexcept
    {
        return LayoutRestored;
    }
    [[nodiscard]] const std::string &QueryLayoutDiagnostic() const noexcept
    {
        return LayoutDiagnostic;
    }
    bool                          ConfigurePlatform() noexcept;
    void                          ConstructInterface();
    [[nodiscard]] PanelDockspace &QueryPanels() noexcept
    {
        return Panels;
    }

  private:
    void ConstructTopBar(float Scale);
    void ConstructNotchBandReturnButton(float Scale);
    void ConstructViewport();
    ControlCentrePanel &Centre;
    PanelDockspace      Panels;
    LogStreamPanel      LogPanel;
    SceneDirectoryPanel OutlinerPanel;
    SceneInspectorPanel  InspectorPanel;
    std::vector<std::unique_ptr<RecordEntry>> SceneRecords;
    EditorProjectSummary Project;
    bool                DockableBrowser      = false;
    bool                NotchBandComposition = false;
    bool                LayoutRestored       = false;
    bool                LayoutBlocked     = false;
    bool                Rendered          = false;
    bool                PendingProjectSplit = false;
    uint64_t            ResetRevision     = 0;
    unsigned            PersistenceFrames = 0;
    double              StableSeconds     = 0;
    double              RetrySeconds      = 0;
    toml::table         ObservedSnapshot;
    toml::table         CaptureLayout() const;
    std::string         SavedLayout;
    std::string         ObservedLayout;
    std::string         LayoutDiagnostic;
    void                ConfigureLayoutDiagnostic(std::string Message);
};
} // namespace Frontier
