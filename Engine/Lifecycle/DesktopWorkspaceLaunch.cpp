/*============================================================================================================================================
                                                        DESKTOPWORKSPACELAUNCH.CPP
============================================================================================================================================*/
// 🧩 Implementation of DesktopWorkspaceLaunch orchestrating GLFW 3.4, ImGuiOverlayRasterization, UVWorkspaceRasterizer & EditorLifecycle

//------------------------------------------------------------------------------------------------------------------------
//                                                        INCLUDES
//------------------------------------------------------------------------------------------------------------------------

#include "Engine/Lifecycle/DesktopWorkspaceLaunch.h"

#include "Engine/Components/Appearance/ThemeRepository.h"
#include "Engine/Components/Appearance/TypographyRepository.h"
#include "Engine/Components/ContentBrowser/ContentBrowserPanel.h"
#include "Engine/Components/ControlCentre/ControlCentrePanel.h"
#include "Engine/Components/Docking/WorkspaceDockContainer.h"
#include "Engine/Components/Panes/WorkspaceAppearance.h"
#include "Engine/GeometricRaster/VulkanInterchange.h"
#include "Engine/GeometricRaster/Rasterization/ImGuiOverlayRasterization.h"
#include "Engine/GeometricRaster/UV/UVWorkspaceRasterizer.h"
#include "Engine/Input/ImGuiInputAdapter.h"
#include "Engine/Input/InputExtension.h"
#include "Engine/Windowing/PlatformWindow.h"
#include "Engine/Workspaces/UV/UVWorkspaceHost.h"

#if FRONTIER_EDITOR_ENABLED
#include "Engine/Components/Controls/CapsuleButton.h"
#include "Engine/Editor/Explorer/ContentBrowser.h"
#include "Engine/Editor/Explorer/ProjectBrowser.h"
#include "Engine/Lifecycle/EditorLifecycle.h"
#endif

#include <imgui.h>

#include <algorithm>
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <string>
#include <vector>

namespace Frontier::Lifecycle
{

namespace
{

void AppendBigEndian32(std::vector<uint8_t>& Buffer, uint32_t Word)
{
    Buffer.push_back(static_cast<uint8_t>((Word >> 24u) & 0xFFu));
    Buffer.push_back(static_cast<uint8_t>((Word >> 16u) & 0xFFu));
    Buffer.push_back(static_cast<uint8_t>((Word >> 8u) & 0xFFu));
    Buffer.push_back(static_cast<uint8_t>(Word & 0xFFu));
}

[[nodiscard]] uint32_t ComputeAdler32(const std::vector<uint8_t>& Bytes) noexcept
{
    uint32_t S1 = 1u;
    uint32_t S2 = 0u;
    for (const uint8_t Byte : Bytes)
    {
        S1 = (S1 + Byte) % 65521u;
        S2 = (S2 + S1) % 65521u;
    }
    return (S2 << 16u) | S1;
}

[[nodiscard]] uint32_t ComputeCrc32(const uint8_t* Bytes, std::size_t Length) noexcept
{
    uint32_t Crc = 0xFFFFFFFFu;
    for (std::size_t Idx = 0u; Idx < Length; ++Idx)
    {
        Crc ^= Bytes[Idx];
        for (uint32_t Bit = 0u; Bit < 8u; ++Bit)
        {
            Crc = (Crc & 1u) != 0u ? ((Crc >> 1u) ^ 0xEDB88320u) : (Crc >> 1u);
        }
    }
    return ~Crc;
}

void AppendPngChunk(std::vector<uint8_t>& Stream, const char Type[4], const std::vector<uint8_t>& Body)
{
    AppendBigEndian32(Stream, static_cast<uint32_t>(Body.size()));
    const std::size_t TypeStart = Stream.size();
    Stream.insert(Stream.end(), Type, Type + 4);
    Stream.insert(Stream.end(), Body.begin(), Body.end());
    AppendBigEndian32(Stream, ComputeCrc32(Stream.data() + TypeStart, 4u + Body.size()));
}

[[nodiscard]] bool WriteLosslessRgbaPng(
    const std::filesystem::path& OutputPath,
    const std::vector<uint8_t>&  RgbaPixels,
    uint32_t                     WidthPx,
    uint32_t                     HeightPx)
{
    if (WidthPx == 0u || HeightPx == 0u || RgbaPixels.size() < static_cast<std::size_t>(WidthPx) * HeightPx * 4u)
    {
        return false;
    }
    if (OutputPath.has_parent_path())
    {
        std::error_code Ec {};
        std::filesystem::create_directories(OutputPath.parent_path(), Ec);
    }

    std::vector<uint8_t> RawScanlines {};
    RawScanlines.reserve(static_cast<std::size_t>(HeightPx) * (1u + static_cast<std::size_t>(WidthPx) * 4u));
    for (uint32_t Row = 0u; Row < HeightPx; ++Row)
    {
        RawScanlines.push_back(0u);
        const std::size_t Start = static_cast<std::size_t>(Row) * WidthPx * 4u;
        RawScanlines.insert(
            RawScanlines.end(),
            RgbaPixels.begin() + static_cast<std::ptrdiff_t>(Start),
            RgbaPixels.begin() + static_cast<std::ptrdiff_t>(Start + WidthPx * 4u));
    }

    std::vector<uint8_t> Zlib { 0x78u, 0x01u };
    std::size_t          Offset = 0u;
    while (Offset < RawScanlines.size())
    {
        const uint16_t BlockLen = static_cast<uint16_t>(std::min<std::size_t>(RawScanlines.size() - Offset, 65535u));
        const bool     Last     = (Offset + BlockLen == RawScanlines.size());
        const uint16_t Neg      = static_cast<uint16_t>(~BlockLen);
        Zlib.push_back(Last ? 0x01u : 0x00u);
        Zlib.push_back(static_cast<uint8_t>(BlockLen & 0xFFu));
        Zlib.push_back(static_cast<uint8_t>((BlockLen >> 8u) & 0xFFu));
        Zlib.push_back(static_cast<uint8_t>(Neg & 0xFFu));
        Zlib.push_back(static_cast<uint8_t>((Neg >> 8u) & 0xFFu));
        Zlib.insert(Zlib.end(), RawScanlines.begin() + static_cast<std::ptrdiff_t>(Offset), RawScanlines.begin() + static_cast<std::ptrdiff_t>(Offset + BlockLen));
        Offset += BlockLen;
    }
    AppendBigEndian32(Zlib, ComputeAdler32(RawScanlines));

    std::vector<uint8_t> Png { 137u, 80u, 78u, 71u, 13u, 10u, 26u, 10u };
    std::vector<uint8_t> Ihdr {};
    AppendBigEndian32(Ihdr, WidthPx);
    AppendBigEndian32(Ihdr, HeightPx);
    Ihdr.insert(Ihdr.end(), { 8u, 6u, 0u, 0u, 0u });
    AppendPngChunk(Png, "IHDR", Ihdr);
    AppendPngChunk(Png, "IDAT", Zlib);
    AppendPngChunk(Png, "IEND", {});

    std::ofstream Out(OutputPath, std::ios::binary | std::ios::trunc);
    if (!Out)
    {
        return false;
    }
    Out.write(reinterpret_cast<const char*>(Png.data()), static_cast<std::streamsize>(Png.size()));
    return Out.good();
}

} // namespace

DesktopResourcePaths ResolveDesktopResourcePaths(
    const std::filesystem::path& ExecutablePath,
    const std::filesystem::path& FallbackRepositoryRoot,
    const std::filesystem::path& FallbackShaderDirectory)
{
    std::vector<std::filesystem::path> SearchRoots {};
    auto AddPathAndAncestors = [&](std::filesystem::path Path)
    {
        if (Path.empty())
        {
            return;
        }
        std::error_code Error {};
        Path = std::filesystem::absolute(Path, Error).lexically_normal();
        if (Error)
        {
            return;
        }
        if (!std::filesystem::is_directory(Path, Error))
        {
            Path = Path.parent_path();
        }
        for (uint32_t Depth = 0u; !Path.empty() && Depth < 12u; ++Depth)
        {
            if (std::find(SearchRoots.begin(), SearchRoots.end(), Path) == SearchRoots.end())
            {
                SearchRoots.push_back(Path);
            }
            const std::filesystem::path Parent = Path.parent_path();
            if (Parent == Path)
            {
                break;
            }
            Path = Parent;
        }
    };

    AddPathAndAncestors(ExecutablePath);
    AddPathAndAncestors(std::filesystem::current_path());
    AddPathAndAncestors(FallbackRepositoryRoot);
    AddPathAndAncestors(FallbackShaderDirectory);

    DesktopResourcePaths Resolved { FallbackRepositoryRoot, FallbackShaderDirectory };
    bool RepoLocated   = false;
    bool ShaderLocated = false;
    for (const auto& Root : SearchRoots)
    {
        const bool GeometryPresent  = std::filesystem::exists(Root / "EngineContent/Geometry/ControlledIntegrator.GeometrySpace");
        const bool FontIndexPresent = std::filesystem::exists(Root / "EngineContent/FontsArchives/FontRepository.FontSpace");
        if (!RepoLocated && (GeometryPresent || FontIndexPresent))
        {
            Resolved.RepositoryRootPath = Root;
            RepoLocated                 = true;
        }

        const std::filesystem::path ShaderFolder = Root / "CompiledShaders";
        if (!ShaderLocated &&
            std::filesystem::exists(ShaderFolder / "SurfaceShading.vert.spv") &&
            std::filesystem::exists(ShaderFolder / "WorldViewportRadiometricCompute.comp.spv"))
        {
            Resolved.CompiledShaderDirectory = ShaderFolder;
            ShaderLocated                    = true;
        }
        else if (!ShaderLocated &&
                 std::filesystem::exists(ShaderFolder / "SurfaceShading.vert.spv") &&
                 std::filesystem::exists(ShaderFolder / "UVTileRasterization.frag.spv"))
        {
            Resolved.CompiledShaderDirectory = ShaderFolder;
        }

        if (!ShaderLocated && (GeometryPresent || FontIndexPresent) &&
            std::filesystem::exists(Root / "SurfaceShading.vert.spv") &&
            std::filesystem::exists(Root / "UVTileRasterization.frag.spv"))
        {
            Resolved.CompiledShaderDirectory = Root;
            if (std::filesystem::exists(Root / "WorldViewportRadiometricCompute.comp.spv"))
            {
                ShaderLocated = true;
            }
        }
    }
    return Resolved;
}

int LaunchDesktopWorkspace(
    DesktopLaunchOptions          InitialOptions,
    std::span<const char* const>  CommandLineArgs,
    const std::filesystem::path&  RepositoryRootPath,
    const std::filesystem::path&  CompiledShaderDir)
{
    Configuration::EngineConfiguration EngineConfig(
        InitialOptions.DefaultLaunchMode == Configuration::HostLaunchMode::StandaloneWorkspace
            ? Configuration::EngineConfiguration::ConstructStandaloneUVDefault()
            : Configuration::EngineConfiguration::ConstructFeatureSetDefault());

    std::vector<std::string_view> ArgViews {};
    ArgViews.reserve(CommandLineArgs.size());
    for (const char* Ptr : CommandLineArgs)
    {
        if (Ptr != nullptr)
        {
            ArgViews.emplace_back(Ptr);
        }
    }
    EngineConfig.ConfigureFromCommandLine(ArgViews);

    for (const char* RawArg : CommandLineArgs)
    {
        if (RawArg == nullptr)
        {
            continue;
        }
        const std::string_view Arg(RawArg);
        if (Arg.starts_with("--frames="))
        {
            InitialOptions.BoundedStepLimit = static_cast<uint32_t>(std::max(1, std::atoi(std::string(Arg.substr(9u)).c_str())));
        }
        else if (Arg.starts_with("--import="))
        {
            InitialOptions.StartupImportPath = std::filesystem::path(Arg.substr(9u));
        }
        else if (Arg.starts_with("--capture-png="))
        {
            InitialOptions.CapturePngOutputPath = std::filesystem::path(Arg.substr(14u));
        }
        else if (Arg == "--open-browser")
        {
            InitialOptions.OpenContentBrowser = true;
            InitialOptions.OpenProjectBrowser = false;
        }
        else if (Arg == "--close-browser")
        {
            InitialOptions.OpenContentBrowser = false;
            InitialOptions.OpenProjectBrowser = false;
        }
        else if (Arg == "--world" || Arg == "--world-editor")
        {
            InitialOptions.OpenWorldEditor    = true;
            InitialOptions.OpenProjectBrowser = false;
        }
        else if (Arg == "--uv" || Arg == "--uv-workspace")
        {
            InitialOptions.OpenWorldEditor    = false;
            InitialOptions.OpenProjectBrowser = false;
            InitialOptions.DefaultLaunchMode  = Configuration::HostLaunchMode::StandaloneWorkspace;
        }
        else if (Arg == "--project-browser")
        {
            InitialOptions.OpenProjectBrowser = true;
        }
        else if (Arg == "--project-reader")
        {
            InitialOptions.OpenProjectBrowser   = true;
            InitialOptions.PreviewReaderOnStart = true;
        }
        else if (Arg == "--new-project")
        {
            InitialOptions.OpenProjectBrowser  = true;
            InitialOptions.OpenNewProjectModal = true;
        }
        else if (Arg.starts_with("--project="))
        {
            InitialOptions.StartupProjectSpacePath = std::filesystem::path(Arg.substr(10u));
            InitialOptions.OpenProjectBrowser      = false;
            InitialOptions.OpenWorldEditor         = true;
        }
    }

    GeometricRaster::VulkanInterchange DeviceInterchange {};
    std::string                          VkDiag {};
    if (!DeviceInterchange.InitializeInterchange(RepositoryRootPath, &VkDiag))
    {
        std::fprintf(stderr, "[FrontierHost] Vulkan initialization failed: %s\n", VkDiag.c_str());
        return 1;
    }
    std::fprintf(
        stdout,
        "[FrontierHost] Active Vulkan Adapter: %.*s (Hardware GPU: %s)\n",
        static_cast<int>(DeviceInterchange.QueryAdapterName().size()),
        DeviceInterchange.QueryAdapterName().data(),
        DeviceInterchange.QueryHardwareAccelerated() ? "YES" : "NO (Software ICD)");
    std::fflush(stdout);

#if FRONTIER_EDITOR_ENABLED
    enum class ActiveHostSurface : uint8_t
    {
        ProjectBrowserSurface = 0u,
        WorldEditorSurface    = 1u,
        UvWorkspaceSurface    = 2u,
    };

    const bool StandaloneUVLaunch =
        (EngineConfig.QueryLaunchMode() == Configuration::HostLaunchMode::StandaloneWorkspace) &&
        !InitialOptions.OpenWorldEditor &&
        !InitialOptions.OpenProjectBrowser;

    ActiveHostSurface CurrentSurface = InitialOptions.OpenProjectBrowser
                                           ? ActiveHostSurface::ProjectBrowserSurface
                                           : (StandaloneUVLaunch ? ActiveHostSurface::UvWorkspaceSurface : ActiveHostSurface::WorldEditorSurface);
#else
    const bool StandaloneUVLaunch = true;
#endif

    GeometricRaster::UVWorkspaceRasterizer UVRasterizer {};
    bool UvStackInitialized = false;
    auto EnsureUvStackReady = [&]() -> bool
    {
        if (UvStackInitialized)
        {
            return true;
        }
        if (!UVRasterizer.InitializeRasterizer(&DeviceInterchange, CompiledShaderDir))
        {
            std::fprintf(stderr, "[FrontierHost] UVWorkspaceRasterizer initialization failed.\n");
            return false;
        }
        UvStackInitialized = true;
        return true;
    };
    if (StandaloneUVLaunch && !EnsureUvStackReady())
    {
        return 1;
    }

#if !defined(__ANDROID__)
    Windowing::DesktopPlatformWindow DesktopWindow {};
    const auto WinDesc = Windowing::WindowConfigurationDescriptor::ConstructApplicationWindow(
        InitialOptions.WindowTitle,
        InitialOptions.InitialWidthPx,
        InitialOptions.InitialHeightPx);
    if (!DesktopWindow.Initialize(WinDesc))
    {
        std::fprintf(stderr, "[FrontierHost] DesktopPlatformWindow initialization failed.\n");
        return 1;
    }

    // In headless GLFW_PLATFORM_NULL environments without an interactive display server, bound frame loop unless specified
    if (DesktopWindow.PlatformCategory() == Windowing::WindowPlatformCategory::GlfwNull &&
        InitialOptions.BoundedStepLimit == 0u)
    {
        InitialOptions.BoundedStepLimit = 4u;
    }
#endif

    IMGUI_CHECKVERSION();
    ImGuiContext* GuiCtx = ImGui::CreateContext();
    ImGui::SetCurrentContext(GuiCtx);
    ImGuiIO& Io = ImGui::GetIO();
    Io.ConfigFlags |= ImGuiConfigFlags_DockingEnable;
    // The Vulkan renderer is initialized after the presenter creates its render pass.
    Io.IniFilename  = nullptr;

    TypographyRepository Typography {};
    if (Typography.LoadRepository(RepositoryRootPath / "EngineContent/FontsArchives") > 0u)
    {
        TypographyRepository::AssignCurrent(&Typography);
        if (ImFont* TabFont = Typography.QueryTabStripFont())
        {
            Io.FontDefault = TabFont;
        }
    }

    Workspaces::UVWorkspaceHost UVHost {};
    Components::HeadlessWorkspaceDockContainer StandaloneDock {};
    ControlCentrePanel                         StandaloneControlCentre {};
    Input::InputExtension                      InputCoordinator {};
    InputCoordinator.Initialize();

#if FRONTIER_EDITOR_ENABLED
    Lifecycle::EditorLifecycle       EditorLoop {};
    Editor::Explorer::ContentBrowser StandaloneBrowser {};
    Editor::Explorer::ProjectBrowser HostProjectBrowser {};
    bool                             EditorStackReady = false;
    bool                             UvHostReady      = false;
    bool                             ProjectBrowserInitialized = false;

    auto EnsureProjectBrowserReady = [&]()
    {
        if (ProjectBrowserInitialized)
        {
            return;
        }
        HostProjectBrowser.AttachVulkanWorldRenderer(&DeviceInterchange, CompiledShaderDir);
        HostProjectBrowser.InitializeDefaultCollection(
            RepositoryRootPath / "Projects",
            RepositoryRootPath,
            CompiledShaderDir.parent_path());
        if (InitialOptions.PreviewReaderOnStart)
        {
            HostProjectBrowser.ActivateEntryByIndex(0);
        }
        if (InitialOptions.OpenNewProjectModal)
        {
            HostProjectBrowser.OpenNewProjectSheet("AeroGallery", RepositoryRootPath / "Projects");
        }
        ProjectBrowserInitialized = true;
    };

    auto EnsureEditorLifecycleReady = [&](const std::filesystem::path& ProjectSpaceFile, std::string_view ProjectTitle) -> bool
    {
        if (!EditorStackReady)
        {
            Lifecycle::EditorStartupConfiguration EditorCfg {};
            EditorCfg.WindowDescriptor = Windowing::WindowConfigurationDescriptor::ConstructApplicationWindow(
                InitialOptions.WindowTitle, InitialOptions.InitialWidthPx, InitialOptions.InitialHeightPx);
            EditorCfg.FontRepositoryRoot      = RepositoryRootPath / "EngineContent/FontsArchives";
            EditorCfg.ProjectSpacePath        = ProjectSpaceFile.empty() ? InitialOptions.StartupProjectSpacePath : ProjectSpaceFile;
            EditorCfg.PopulateShowcaseScene   = true;
            EditorCfg.VulkanDevice            = &DeviceInterchange;
            EditorCfg.CompiledShaderDirectory = CompiledShaderDir;
            if (!EditorLoop.Initialize(EditorCfg))
            {
                std::fprintf(stderr, "[FrontierHost] EditorLifecycle initialization failed.\n");
                return false;
            }
            EditorLoop.AssignReturnToProjectBrowserCallback(
                [&]()
                {
                    EnsureProjectBrowserReady();
                    CurrentSurface = ActiveHostSurface::ProjectBrowserSurface;
                });
            auto& EditorBrowserPanel = EditorLoop.AccessContentBrowser().AccessPanel();
            EditorBrowserPanel.ConfigureShelfExtent(
                InitialOptions.OpenContentBrowser ? ContentShelfExtent::SplitHalf : ContentShelfExtent::Closed,
                true);
            (void)EditorBrowserPanel.ActivateCategory(ContentCategory::Colours);
            EditorStackReady = true;
        }
        if (!ProjectTitle.empty())
        {
            EditorLoop.ConfigureActiveProjectTitle(ProjectTitle);
        }
        return true;
    };

    auto EnsureUvHostReady = [&](const std::filesystem::path& GeometryPath) -> bool
    {
        if (!EnsureUvStackReady())
        {
            return false;
        }
        if (!UvHostReady)
        {
            UVHost.ConfigureLaunchPolicy(EngineConfig);
            (void)UVHost.AccessSession().InitializeGPUSolvers(&DeviceInterchange, CompiledShaderDir);
            (void)UVHost.AttachVulkanRasterizer(&UVRasterizer);

            ThemeRepository ThemeRepo {};
            (void)StandaloneDock.Initialize(
                Windowing::WindowConfigurationDescriptor::ConstructApplicationWindow(
                    InitialOptions.WindowTitle, InitialOptions.InitialWidthPx, InitialOptions.InitialHeightPx));
            Components::ConfigureImGuiWorkspaceStyle(StandaloneDock.ActiveTabMetrics());
            Components::ConfigureImGuiWorkspaceTheme(StandaloneDock.ActiveTabMetrics(), ThemeRepo);
            StandaloneControlCentre.AttachTypefaces(&Typography);
            StandaloneControlCentre.AccessDraftAppearance().Theme = ThemePreset::Dark;
            StandaloneControlCentre.ApplyDraftAppearanceImmediate();
            StandaloneControlCentre.AccessNotificationStream().ClearPending();

            StandaloneBrowser.AttachThemeRepository(&StandaloneControlCentre.QueryThemeRepository());
            UVHost.AttachContentBrowser(&StandaloneBrowser);
            StandaloneBrowser.AccessPanel().ConfigureShelfExtent(
                InitialOptions.OpenContentBrowser ? ContentShelfExtent::SplitHalf : ContentShelfExtent::Closed,
                true);
            (void)StandaloneBrowser.AccessPanel().ActivateCategory(ContentCategory::Colours);
            UVHost.RegisterDockPanes(StandaloneDock);
            UvHostReady = true;
        }
        const std::filesystem::path PathToLoad = GeometryPath.empty() ? InitialOptions.StartupImportPath : GeometryPath;
        if (!PathToLoad.empty())
        {
            std::string ImportDiag {};
            const std::string Ext = PathToLoad.extension().string();
            if (Ext == ".obj" || Ext == ".OBJ" || Ext == ".GeometrySpace" || Ext == ".geometryspace")
            {
                (void)UVHost.IntakeExternalFileDrop(PathToLoad, ImportDiag);
            }
        }
        return true;
    };

    HostProjectBrowser.AssignLaunchWorkspaceCallback(
        [&](const Editor::Explorer::BrowserWorkspaceLaunchDirective& Directive)
        {
            if (Directive.TargetWorkspace == Workspaces::HostWorkspaceTarget::UVWorkspace)
            {
                if (EnsureUvHostReady(Directive.SelectedFilePath))
                {
                    CurrentSurface = ActiveHostSurface::UvWorkspaceSurface;
                }
            }
            else
            {
                if (EnsureEditorLifecycleReady(Directive.SelectedFilePath, Directive.ProjectTitle))
                {
                    CurrentSurface = ActiveHostSurface::WorldEditorSurface;
                }
            }
        });

    if (CurrentSurface == ActiveHostSurface::ProjectBrowserSurface)
    {
        EnsureProjectBrowserReady();
    }
    else if (CurrentSurface == ActiveHostSurface::WorldEditorSurface)
    {
        if (!EnsureEditorLifecycleReady(InitialOptions.StartupProjectSpacePath, {}))
        {
            ImGui::DestroyContext(GuiCtx);
            return 1;
        }
    }
    else
    {
        if (!EnsureUvHostReady(InitialOptions.StartupImportPath))
        {
            ImGui::DestroyContext(GuiCtx);
            return 1;
        }
    }
#else
    ContentBrowserPanel StandaloneBrowserPanel {};
    UVHost.ConfigureLaunchPolicy(EngineConfig);
    (void)UVHost.AccessSession().InitializeGPUSolvers(&DeviceInterchange, CompiledShaderDir);
    (void)UVHost.AttachVulkanRasterizer(&UVRasterizer);
    if (!InitialOptions.StartupImportPath.empty())
    {
        std::string ImportDiag {};
        (void)UVHost.IntakeExternalFileDrop(InitialOptions.StartupImportPath, ImportDiag);
    }
    ThemeRepository ThemeRepo {};
    (void)StandaloneDock.Initialize(
        Windowing::WindowConfigurationDescriptor::ConstructApplicationWindow(
            InitialOptions.WindowTitle, InitialOptions.InitialWidthPx, InitialOptions.InitialHeightPx));
    Components::ConfigureImGuiWorkspaceStyle(StandaloneDock.ActiveTabMetrics());
    Components::ConfigureImGuiWorkspaceTheme(StandaloneDock.ActiveTabMetrics(), ThemeRepo);
    StandaloneControlCentre.AttachTypefaces(&Typography);
    StandaloneControlCentre.AccessDraftAppearance().Theme = ThemePreset::Dark;
    StandaloneControlCentre.ApplyDraftAppearanceImmediate();
    StandaloneControlCentre.AccessNotificationStream().ClearPending();
    StandaloneBrowserPanel.AttachThemeRepository(&StandaloneControlCentre.QueryThemeRepository());
    UVHost.AttachContentBrowserPanel(&StandaloneBrowserPanel);
    StandaloneBrowserPanel.ConfigureShelfExtent(
        InitialOptions.OpenContentBrowser ? ContentShelfExtent::SplitHalf : ContentShelfExtent::Closed,
        true);
    (void)StandaloneBrowserPanel.ActivateCategory(ContentCategory::Colours);
    UVHost.RegisterDockPanes(StandaloneDock);
#endif

    GeometricRaster::ImGuiOverlayRasterization SwapchainPresenter {};
#if !defined(__ANDROID__)
    Windowing::DesktopPlatformWindow* PresenterWindow = &DesktopWindow;
#else
    Windowing::DesktopPlatformWindow* PresenterWindow = nullptr;
#endif
    if (!SwapchainPresenter.InitializeOverlay(
            &DeviceInterchange,
            CompiledShaderDir,
            PresenterWindow,
            InitialOptions.InitialWidthPx,
            InitialOptions.InitialHeightPx,
            &VkDiag))
    {
        std::fprintf(stderr, "[FrontierHost] ImGuiOverlayRasterization initialization failed: %s\n", VkDiag.c_str());
        ImGui::DestroyContext(GuiCtx);
        return 1;
    }

    uint32_t ExecutedSteps = 0u;
    auto     LastTick       = std::chrono::steady_clock::now();

    while (true)
    {
#if !defined(__ANDROID__)
        if (DesktopWindow.CloseRequested())
        {
            break;
        }
#endif
        if (InitialOptions.BoundedStepLimit > 0u && ExecutedSteps >= InitialOptions.BoundedStepLimit)
        {
            break;
        }

        const auto   NowTick = std::chrono::steady_clock::now();
        const double Dt      = std::clamp(std::chrono::duration<double>(NowTick - LastTick).count(), 1.0 / 240.0, 0.050);
        LastTick             = NowTick;

        uint32_t SurfaceW = InitialOptions.InitialWidthPx;
        uint32_t SurfaceH = InitialOptions.InitialHeightPx;

#if !defined(__ANDROID__)
        InputCoordinator.BeginTick();
        DesktopWindow.PollOperatingEvents(InputCoordinator);
        (void)InputCoordinator.TickExchange();
        Input::InputExtension::AssignActiveCoordinator(&InputCoordinator);

        const auto Extent = DesktopWindow.InspectExtent();
        if (Extent.SurfacePixelWidth == 0u || Extent.SurfacePixelHeight == 0u)
        {
            DesktopWindow.WaitOperatingEventsTimeout(0.01);
            continue;
        }
        SurfaceW = Extent.SurfacePixelWidth;
        SurfaceH = Extent.SurfacePixelHeight;
#if FRONTIER_EDITOR_ENABLED
        if (EditorStackReady)
        {
            if (auto* HostSurface = EditorLoop.AccessDockContainer().AccessOperatingSurface(Components::HostWindowToken{ 0u }))
            {
                HostSurface->ResizeSurface(SurfaceW, SurfaceH, Extent.DpiScaleFactor);
            }
        }
        if (UvHostReady)
        {
            if (auto* HostSurface = StandaloneDock.AccessOperatingSurface(Components::HostWindowToken{ 0u }))
            {
                HostSurface->ResizeSurface(SurfaceW, SurfaceH, Extent.DpiScaleFactor);
            }
        }
#else
        if (auto* HostSurface = StandaloneDock.AccessOperatingSurface(Components::HostWindowToken{ 0u }))
        {
            HostSurface->ResizeSurface(SurfaceW, SurfaceH, Extent.DpiScaleFactor);
        }
#endif

        (void)Input::ImGuiInputAdapter::ForwardEditorExchangeToImGui(InputCoordinator, Io);

        const auto DroppedPaths = InputCoordinator.ConsumeDroppedFilePaths();
#if FRONTIER_EDITOR_ENABLED
        if (CurrentSurface == ActiveHostSurface::ProjectBrowserSurface)
        {
            for (const std::string& DropFile : DroppedPaths)
            {
                (void)HostProjectBrowser.RegisterDiskPathInCollection(std::filesystem::path(DropFile), true);
            }
        }
        else if (CurrentSurface == ActiveHostSurface::UvWorkspaceSurface && UvHostReady)
        {
            for (const std::string& DropFile : DroppedPaths)
            {
                std::string DropDiag {};
                (void)UVHost.IntakeExternalFileDrop(DropFile, DropDiag);
            }
        }
#else
        for (const std::string& DropFile : DroppedPaths)
        {
            std::string DropDiag {};
            (void)UVHost.IntakeExternalFileDrop(DropFile, DropDiag);
        }
#endif
#endif

        Io.DisplaySize = ImVec2(static_cast<float>(SurfaceW), static_cast<float>(SurfaceH));
        Io.DeltaTime   = static_cast<float>(Dt);

        SwapchainPresenter.PrepareImGuiFrame();
        ImGui::NewFrame();
        const Rectangle2D FullBounds { 0.0f, 0.0f, static_cast<float>(SurfaceW), static_cast<float>(SurfaceH) };
#if FRONTIER_EDITOR_ENABLED
        if (CurrentSurface == ActiveHostSurface::ProjectBrowserSurface)
        {
            HostProjectBrowser.Render(FullBounds, Dt, 1.0f);
        }
        else if (CurrentSurface == ActiveHostSurface::WorldEditorSurface)
        {
            (void)EditorLoop.ExecuteExternalDesktopTick(Dt);
            Input::InputExtension::AssignActiveCoordinator(&InputCoordinator);
            EditorLoop.PresentPrimaryEditorImGui(Dt);
        }
        else
        {
            const float UvUiScale = std::clamp(StandaloneControlCentre.QueryInterfaceScaleFactor(), 0.75f, 2.0f);
            Components::ConfigureImGuiWorkspaceTheme(
                StandaloneDock.ActiveTabMetrics(),
                StandaloneControlCentre.QueryThemeRepository());
            auto& UvBrowserPanel = StandaloneBrowser.AccessPanel();
            UvBrowserPanel.SynchronizeHostBounds(FullBounds, UvUiScale);
            if (StandaloneControlCentre.QueryOpen())
            {
                WorkspaceAppearance::AssignOverlayPointerShield(FullBounds);
            }
            else
            {
                WorkspaceAppearance::AssignOverlayPointerShield(
                    UvBrowserPanel.QueryDrawerPhysicalBounds(),
                    UvBrowserPanel.QueryNotchPhysicalBounds());
            }
            StandaloneDock.PresentWindowImGuiPanes(Components::HostWindowToken{ 0u });
            WorkspaceAppearance::ClearOverlayPointerShield();
            StandaloneBrowser.Render(FullBounds, Dt, UvUiScale);
            StandaloneControlCentre.Render(FullBounds, Dt, static_cast<float>(1.0 / Dt));

            if (!StandaloneControlCentre.QueryOpen())
            {
                PixelSpace TopOverlay(ImGui::GetForegroundDrawList(), Point2D{ 0.0f, 0.0f }, UvUiScale);
                const Point2D MouseLogical = TopOverlay.QueryMousePosition();
                ControlPointer Ptr { MouseLogical.X, MouseLogical.Y, TopOverlay.QueryMouseDown(0), TopOverlay.QueryMouseClicked(0), TopOverlay.QueryMouseReleased(0) };
                ButtonDescriptor Desc { "Projects", ButtonTone::Secondary, 10.5f, 12.0f };
                const float LogicalW = FullBounds.Width / UvUiScale;
                if (CapsuleButton::Construct(TopOverlay, { std::max(320.0f, LogicalW * 0.5f + 98.0f), 3.0f, 82.0f, 23.0f }, Desc, Ptr).Pressed)
                {
                    EnsureProjectBrowserReady();
                    CurrentSurface = ActiveHostSurface::ProjectBrowserSurface;
                }
            }
        }
#else
        const float UvUiScale = std::clamp(StandaloneControlCentre.QueryInterfaceScaleFactor(), 0.75f, 2.0f);
        Components::ConfigureImGuiWorkspaceTheme(
            StandaloneDock.ActiveTabMetrics(),
            StandaloneControlCentre.QueryThemeRepository());
        StandaloneBrowserPanel.SynchronizeHostBounds(FullBounds, UvUiScale);
        if (StandaloneControlCentre.QueryOpen())
        {
            WorkspaceAppearance::AssignOverlayPointerShield(FullBounds);
        }
        else
        {
            WorkspaceAppearance::AssignOverlayPointerShield(
                StandaloneBrowserPanel.QueryDrawerPhysicalBounds(),
                StandaloneBrowserPanel.QueryNotchPhysicalBounds());
        }
        StandaloneDock.PresentWindowImGuiPanes(Components::HostWindowToken{ 0u });
        WorkspaceAppearance::ClearOverlayPointerShield();
        StandaloneBrowserPanel.Render(FullBounds, Dt, UvUiScale);
        StandaloneControlCentre.Render(FullBounds, Dt, static_cast<float>(1.0 / Dt));
#endif
        ImGui::Render();

        if (!SwapchainPresenter.PresentImGuiBatches(ImGui::GetDrawData(), SurfaceW, SurfaceH))
        {
            const std::string Diagnostic(SwapchainPresenter.QueryLastPresentationDiagnostic());
            std::fprintf(stderr, "[FrontierHost] ImGui Vulkan presentation failed: %s\n", Diagnostic.c_str());
            SwapchainPresenter.TeardownOverlay();
            ImGui::DestroyContext(GuiCtx);
            return 1;
        }
        ++ExecutedSteps;
    }

    if (!InitialOptions.CapturePngOutputPath.empty())
    {
        std::vector<uint8_t> CapturedRgba {};
        uint32_t             CapW = 0u;
        uint32_t             CapH = 0u;
        if (!SwapchainPresenter.ReadbackLastPresentedRgba(CapturedRgba, CapW, CapH) ||
            !WriteLosslessRgbaPng(InitialOptions.CapturePngOutputPath, CapturedRgba, CapW, CapH))
        {
            std::fprintf(stderr, "[FrontierHost] Failed to capture presented swapchain PNG.\n");
            SwapchainPresenter.TeardownOverlay();
            ImGui::DestroyContext(GuiCtx);
            return 1;
        }
    }

    SwapchainPresenter.TeardownOverlay();
#if FRONTIER_EDITOR_ENABLED
    HostProjectBrowser.ReleaseGpuTextures();
    if (EditorStackReady)
    {
        EditorLoop.Finalize();
    }
    if (UvHostReady)
    {
        StandaloneDock.Finalize();
        UVHost.AccessSession().TeardownGPUSolvers();
    }
#else
    StandaloneDock.Finalize();
    UVHost.AccessSession().TeardownGPUSolvers();
#endif
    if (UvStackInitialized)
    {
        UVRasterizer.TeardownRasterizer();
    }
    InputCoordinator.Finalize();
#if !defined(__ANDROID__)
    DesktopWindow.Finalize();
#endif
    TypographyRepository::AssignCurrent(nullptr);
    ImGui::DestroyContext(GuiCtx);
    return 0;
}

} // namespace Frontier::Lifecycle
