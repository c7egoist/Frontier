/*============================================================================================================================================
                                                      PROJECTBROWSERVALIDATION.CPP
============================================================================================================================================*/
// 🧩 End-to-end validation of WorkspaceCapabilityRegister, ProjectGenerator (3-target CMake + SessionOutput), ShowcaseGalleryScene & ProjectBrowser

#include "Engine/Configuration/ProjectGenerator.h"
#include "Engine/Configuration/ProjectSpaceRepository.h"
#include "Engine/GeometricRaster/GlobalIllumination/ShowcaseGalleryScene.h"
#include "Engine/Lifecycle/ProjectExecutionRunner.h"
#include "Engine/Workspaces/WorkspaceCapabilityRegister.h"

#if FRONTIER_EDITOR_ENABLED
#include "Engine/Editor/Explorer/ProjectBrowser.h"
#include "Engine/Lifecycle/EditorLifecycle.h"
#endif

#include <imgui.h>

#include <cstdio>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <sstream>
#include <string>

#ifndef FRONTIER_REPO_ROOT_DIR
#define FRONTIER_REPO_ROOT_DIR "."
#endif

namespace
{

[[nodiscard]] std::string ReadEntireFileText(const std::filesystem::path& FilePath)
{
    std::ifstream Stream(FilePath, std::ios::binary);
    std::ostringstream Buffer {};
    Buffer << Stream.rdbuf();
    return Buffer.str();
}

} // namespace

int main()
{
    using namespace Frontier;

    // 1. Validate WorkspaceCapabilityRegister
    Workspaces::WorkspaceCapabilityRegister CapReg {};
    const auto AllCaps = CapReg.QueryAllCapabilities();
    if (AllCaps.size() != 2u ||
        AllCaps[0].Identifier != "Frontier" ||
        AllCaps[0].ActionTitle != "Open with Frontier" ||
        AllCaps[1].Identifier != "UVWorkspace" ||
        AllCaps[1].ActionTitle != "Open with UVWorkspace")
    {
        std::fprintf(stderr, "[FAIL] WorkspaceCapabilityRegister expected Frontier + UVWorkspace capabilities.\n");
        return 1;
    }

    const auto ProjPermitted = CapReg.QueryPermittedForPath("Demo.projectspace");
    const auto UvPermitted   = CapReg.QueryPermittedForPath("Housing.UVSpace");
    if (ProjPermitted.empty() || ProjPermitted.front().Target != Workspaces::HostWorkspaceTarget::FrontierWorld ||
        UvPermitted.empty() || UvPermitted.front().Target != Workspaces::HostWorkspaceTarget::UVWorkspace)
    {
        std::fprintf(stderr, "[FAIL] WorkspaceCapabilityRegister path priority mismatch.\n");
        return 1;
    }

    // 2. Validate ProjectGenerator scaffolding (SessionOutput/, 3 CMake targets, .projectspace round-trip)
    const std::filesystem::path TempBase = std::filesystem::temp_directory_path() / "FrontierProjectGenValidation";
    std::error_code CleanupEc {};
    std::filesystem::remove_all(TempBase, CleanupEc);

    const std::filesystem::path RepoRoot(FRONTIER_REPO_ROOT_DIR);
    const std::filesystem::path ActiveBinDir = std::filesystem::current_path() / "Binaries" / "Win64";

    Configuration::ProjectScaffoldSpecification Spec {};
    Spec.DisplayName          = "Aero Gallery";
    Spec.DestinationDirectory = TempBase;
    Spec.FrontierRootPath     = RepoRoot;
    Spec.FrontierBinariesPath = ActiveBinDir;
    Spec.InitialTheme         = ThemePreset::Oled;

    const auto Scaffold = Configuration::ProjectGenerator::GenerateProject(Spec);
    if (!Scaffold.Succeeded || Scaffold.PascalIdentifier != "AeroGallery")
    {
        std::fprintf(stderr, "[FAIL] ProjectGenerator failed: %s\n", Scaffold.Diagnostic.c_str());
        return 1;
    }

    if (!std::filesystem::exists(Scaffold.ProjectRootDirectory / "SessionOutput") ||
        std::filesystem::exists(Scaffold.ProjectRootDirectory / "Saved") ||
        std::filesystem::exists(Scaffold.ProjectRootDirectory / "Sdk") ||
        std::filesystem::exists(Scaffold.ProjectRootDirectory / "SDK") ||
        !std::filesystem::exists(Scaffold.ProjectRootDirectory / "Engine" / "UserInterface" / "AeroGalleryViewportOverlay.h") ||
        !std::filesystem::exists(Scaffold.ProjectSpaceFile) ||
        !std::filesystem::exists(Scaffold.CMakeListsFile))
    {
        std::fprintf(stderr, "[FAIL] Scaffolded directory structure violated SessionOutput / zero-SDK / UserInterface contract.\n");
        return 1;
    }

    ProjectSpaceDocument LoadedSpace {};
    std::string          SpaceDiag   {};
    if (!ProjectSpaceRepository::Load(Scaffold.ProjectSpaceFile, LoadedSpace, SpaceDiag) ||
        LoadedSpace.ProjectTitle != "Aero Gallery" ||
        LoadedSpace.Appearance.Theme != ThemePreset::Oled)
    {
        std::fprintf(stderr, "[FAIL] .projectspace round-trip failed: %s\n", SpaceDiag.c_str());
        return 1;
    }

    const std::string CMakeText = ReadEntireFileText(Scaffold.CMakeListsFile);
    if (CMakeText.find("add_executable(AeroGallery ") == std::string::npos ||
        CMakeText.find("add_executable(AeroGalleryEditor ") == std::string::npos ||
        CMakeText.find("add_executable(AeroGalleryShipping ") == std::string::npos ||
        CMakeText.find("Sdk") != std::string::npos ||
        CMakeText.find("SDK") != std::string::npos)
    {
        std::fprintf(stderr, "[FAIL] Generated CMakeLists.txt missing 3 targets or contains forbidden SDK naming.\n");
        return 1;
    }

    // 3. Validate FrontierRunShippingProjectLoop directly in-process
    double TickedTime = 0.0;
    FrontierProjectLaunchDescriptor ShipDesc {};
    ShipDesc.StructureVersion = 1u;
    ShipDesc.ProjectTitle     = "AeroGallery";
    ShipDesc.InitialWidthPx   = 640u;
    ShipDesc.InitialHeightPx  = 360u;
    ShipDesc.BoundedTickCount = 3u;
    ShipDesc.UserPayload          = &TickedTime;
    ShipDesc.NotifySimulationStep = [](double Dt, void* Ptr)
    {
        *static_cast<double*>(Ptr) += Dt;
    };
    if (FrontierRunShippingProjectLoop(&ShipDesc) != 0 || TickedTime <= 0.0)
    {
        std::fprintf(stderr, "[FAIL] FrontierRunShippingProjectLoop failed.\n");
        return 1;
    }

    // 3b. When shared binaries exist in Binaries/Win64 (Editor / Development builds), compile & run all 3 generated targets externally
#if !FRONTIER_PROFILE_SHIPPING && !defined(_WIN32)
    if (std::filesystem::exists(ActiveBinDir / "libFrontierEngine.so") &&
        std::filesystem::exists(ActiveBinDir / "libFrontierWorkspaceUi.so"))
    {
        const std::filesystem::path ExtBuildDir = Scaffold.ProjectRootDirectory / "build-ext";
        const std::string CMakeConfigureCmd =
            "cmake -S \"" + Scaffold.ProjectRootDirectory.string() +
            "\" -B \"" + ExtBuildDir.string() +
            "\" -DFRONTIER_ENGINE_ROOT=\"" + RepoRoot.string() +
            "\" -DFRONTIER_BINARIES_DIR=\"" + ActiveBinDir.string() + "\"";
        const std::string CMakeBuildCmd =
            "cmake --build \"" + ExtBuildDir.string() + "\" --parallel 2";

        if (std::system(CMakeConfigureCmd.c_str()) != 0 || std::system(CMakeBuildCmd.c_str()) != 0)
        {
            std::fprintf(stderr, "[FAIL] External CMake build of generated 3-target project failed.\n");
            return 1;
        }

        const std::filesystem::path OutBin = Scaffold.ProjectRootDirectory / "Binaries" / "Win64";
        for (const char* TargetName : { "AeroGallery", "AeroGalleryEditor", "AeroGalleryShipping" })
        {
            const std::filesystem::path ExePath = OutBin / TargetName;
            if (!std::filesystem::exists(ExePath))
            {
                std::fprintf(stderr, "[FAIL] Generated target binary missing: %s\n", ExePath.string().c_str());
                return 1;
            }
            const std::string RunCmd = "\"" + ExePath.string() + "\" --verify-ticks";
            if (std::system(RunCmd.c_str()) != 0)
            {
                std::fprintf(stderr, "[FAIL] Generated target execution failed: %s\n", TargetName);
                return 1;
            }
        }
    }
#endif

#if FRONTIER_EDITOR_ENABLED
    // 4. Validate ShowcaseGalleryScene + EditorLifecycle live authoring hooks
    {
        Lifecycle::EditorLifecycle Editor {};
        Lifecycle::EditorStartupConfiguration EditorCfg {};
        EditorCfg.FontRepositoryRoot    = RepoRoot / "EngineContent/FontsArchives";
        EditorCfg.PopulateShowcaseScene = true;
        if (!Editor.Initialize(EditorCfg))
        {
            std::fprintf(stderr, "[FAIL] EditorLifecycle initialization failed.\n");
            return 1;
        }

        auto* Panes  = Editor.AccessWorkspaces().AccessActivePanes();
        auto* Bundle = Editor.AccessShowcaseScene();
        if (Panes == nullptr || Bundle == nullptr)
        {
            std::fprintf(stderr, "[FAIL] Active panes or ShowcaseBundle missing.\n");
            return 1;
        }

        const auto ConstructTemplates = Panes->Outliner.QueryConstructTemplates();
        if (ConstructTemplates.size() < 26u)
        {
            std::fprintf(stderr, "[FAIL] Expected >= 26 unified Construct templates, got %zu.\n", ConstructTemplates.size());
            return 1;
        }

        const std::size_t InitialClusterCount = Bundle->Scene.ClusterInstances.size();
        const OutlinerSlotToken SpawnedSphere = GeometricRaster::ConstructShowcasePrimitiveInOutliner(
            Panes->Outliner,
            *Bundle,
            GeometricRaster::ShowcasePrimitiveShape::Sphere,
            { 0.15f, -0.35f, -0.30f });
        if (!SpawnedSphere.Valid() || Bundle->Scene.ClusterInstances.size() <= InitialClusterCount)
        {
            std::fprintf(stderr, "[FAIL] ConstructShowcasePrimitiveInOutliner failed to adopt Sphere into WorldSceneSpecification.\n");
            return 1;
        }

        if (!GeometricRaster::AssignShowcaseEntryBaseColor(
                Panes->Outliner,
                *Bundle,
                SpawnedSphere,
                ColorRgba{ 210u, 72u, 58u, 255u },
                "Vermilion Specimen"))
        {
            std::fprintf(stderr, "[FAIL] AssignShowcaseEntryBaseColor failed.\n");
            return 1;
        }

        const OutlinerSlotToken PickedCenter = GeometricRaster::PickShowcaseGalleryEntryAtUv(Panes->Outliner, *Bundle, 0.50f, 0.54f);
        if (!PickedCenter.Valid())
        {
            std::fprintf(stderr, "[FAIL] PickShowcaseGalleryEntryAtUv failed to intersect central Showcase geometry.\n");
            return 1;
        }

        Editor.FrameShowcaseCameraSelection();
        if (!Editor.ExecuteAuthoringTick(1.0 / 60.0))
        {
            std::fprintf(stderr, "[FAIL] EditorLifecycle::ExecuteAuthoringTick returned false.\n");
            return 1;
        }
        Editor.Finalize();
    }

    // 5. Validate ProjectBrowser collection, Tier 1 GTX thumbnails, Reader mode, & ImGui PixelSpace rendering
    {
        IMGUI_CHECKVERSION();
        ImGuiContext* Ctx = ImGui::CreateContext();
        ImGui::SetCurrentContext(Ctx);
        ImGuiIO& Io    = ImGui::GetIO();
        Io.DisplaySize = ImVec2(1600.0f, 920.0f);
        unsigned char* FontPixels = nullptr;
        int FontW = 0, FontH = 0;
        Io.Fonts->GetTexDataAsRGBA32(&FontPixels, &FontW, &FontH);

        Editor::Explorer::ProjectBrowser Browser {};
        Browser.InitializeDefaultCollection(TempBase, RepoRoot, ActiveBinDir);
        if (Browser.QueryCollection().size() < 5u ||
            Browser.QueryCollection()[0].ThumbnailW != 264u ||
            Browser.QueryCollection()[0].ThumbnailH != 160u)
        {
            std::fprintf(stderr, "[FAIL] ProjectBrowser failed to populate rendered Tier 1 GTX thumbnails.\n");
            ImGui::DestroyContext(Ctx);
            return 1;
        }

        ImGui::NewFrame();
        Browser.Render({ 0.0f, 0.0f, 1600.0f, 920.0f }, 1.0 / 60.0, 1.0f);
        ImGui::Render();

        Browser.ActivateEntryByIndex(0);
        if (!Browser.QueryReaderActive())
        {
            std::fprintf(stderr, "[FAIL] ProjectBrowser::ActivateEntryByIndex failed to enter Reader view.\n");
            ImGui::DestroyContext(Ctx);
            return 1;
        }

        ImGui::NewFrame();
        Browser.Render({ 0.0f, 0.0f, 1600.0f, 920.0f }, 1.0 / 60.0, 1.0f);
        ImGui::Render();

        Browser.ReleaseGpuTextures();
        ImGui::DestroyContext(Ctx);
    }
#endif

    std::filesystem::remove_all(TempBase, CleanupEc);
    std::printf("[PASS] ProjectBrowserValidation verified WorkspaceCapabilityRegister, ProjectGenerator, ShowcaseGalleryScene & ProjectBrowser.\n");
    return 0;
}
