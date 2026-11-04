/*==========================================================================================================================================
                                                       PARTICLEEDITORWORKSPACE.H
==========================================================================================================================================*/
// 🧩 The Particle editor as the approved prototype lays it out: the Outliner (environment and effects), the viewport (the GPU image,
//    its HUD, probe, minimap and field overlay), the Log Stream, the Inspector and the preset library.

#pragma once

#include "Engine/Diagnostics/BuildConfiguration.h"

#if FRONTIER_EDITOR && defined(FRONTIER_WITH_INTERFACE_SDK)

#include "Engine/Interface/ParticleEditor/ParticleEditorPages.h"

#include <imgui.h>

#include <chrono>
#include <filesystem>
#include <string>
#include <string_view>
#include <vector>

namespace Frontier
{

struct ParticleLogLine
{
    std::string Time;
    std::string Category;
    std::string Text;
    std::string Detail;
    bool        Warm = false;
};

class ParticleEditorWorkspace
{
public:
    explicit ParticleEditorWorkspace(const std::filesystem::path& LibraryFile);

    // 📝 One interface tick: advances the scene by DeltaSeconds, asks the presenter for the image and lays the editor out in the
    //    rectangle (the editor window's body).
    void Construct(ImVec2 Minimum, ImVec2 Maximum, float Scale, double DeltaSeconds);

    // 📝 The verbs the pages and the captures use: "select:<token>", "add:<preset>", "duplicate:<token>", "remove:<token>",
    //    "rebuild:<token>", "add-force:<category>", "remove-force:<index>", "reset", "strike", "pause", "play", "time-scale:<x>",
    //    "library:on|off", "overlay:on|off", "contribution:flow|accelerate|damp", "camera:<yaw>,<pitch>,<distance>", "top-view".
    bool Perform(std::string_view Action);

    [[nodiscard]] ParticleScene&               AccessScene() noexcept { return Scene; }
    [[nodiscard]] const ParticleEffectLibrary& QueryLibrary() const noexcept { return Library; }
    [[nodiscard]] const ParticleViewportImage& QueryImage() const noexcept { return Image; }
    [[nodiscard]] const std::string&           QueryDiagnostic() const noexcept { return Diagnostic; }
    [[nodiscard]] bool                         QueryLibraryShown() const noexcept { return LibraryShown; }
    [[nodiscard]] const std::vector<ParticleLogLine>& QueryLog() const noexcept { return Log; }

    ParticleViewportPresenter Presenter;
    ParticleFieldOverlay      Overlay;

private:
    void ConstructOutliner(ImDrawList* Ink, ImVec2 Minimum, ImVec2 Maximum, float Scale);
    void ConstructViewport(ImDrawList* Ink, ImVec2 Minimum, ImVec2 Maximum, float Scale);
    void ConstructLogStream(ImDrawList* Ink, ImVec2 Minimum, ImVec2 Maximum, float Scale);
    void ConstructInspector(ImVec2 Minimum, ImVec2 Maximum, float Scale);
    void ConstructLibrarySheet(ImDrawList* Ink, ImVec2 Minimum, ImVec2 Maximum, float Scale);
    void Present(uint32_t Width, uint32_t Height, double DeltaSeconds);
    void AppendLog(std::string Category, std::string Text, std::string Detail = {}, bool Warm = false);

    ParticleEffectLibrary        Library;
    ParticleScene                Scene;
    ParticleRefreshPlan          Plan;
    ParticleViewportImage        Image;
    std::vector<std::string>     Requests;
    std::vector<ParticleLogLine> Log;
    std::string                  Diagnostic;
    std::string                  LibraryGroup = "All";
    char                         LibraryQuery[64] = {};
    bool                         LibraryShown = false;
    bool                         Planned      = false;
    double                       LatticeClock = 1.0;   // [s] since the last lattice readback
    std::array<uint32_t, 2>      ViewExtent{ 960u, 540u };
    std::chrono::steady_clock::time_point Opened = std::chrono::steady_clock::now();
};

} // namespace Frontier

#endif
