/*==========================================================================================================================================
                                                   SCENEVIEWPORTWORKSPACECAPTURE.CPP
==========================================================================================================================================*/
// 🧩 The Everest workspace with its live Scene Viewport, captured offscreen: the real EverestWorkspace and EverestSceneViewport
//    (records → SceneViewport on a device of its own), the presented image read back and CPU-rasterized into the interface.

#include "Engine/Interface/IconPresentation.h"
#include "Engine/Interface/InspectorRuntime.h"
#include "EverestSceneViewport.h"
#include "EverestWorkspace.h"
#include "Exhibits/ControlCentre/Code/CpuRasterization.h"
#include "UI/Editor/ControlCentrePanel.h"

#include <imgui.h>
#include <stb_image_write.h>

#include <chrono>
#include <cstdio>
#include <filesystem>
#include <stdexcept>
#include <string>
#include <vector>

namespace
{

constexpr int      CaptureWidth  = 1920;
constexpr int      CaptureHeight = 1080;
constexpr uint64_t ViewportTag   = 0x5CE7E5u;   // [-] ImTextureID the capture resolves to the read-back image

void Require(bool Condition, const std::string& Message)
{
    if (!Condition) throw std::runtime_error(Message);
}

} // namespace

int main(int ArgumentCount, char** Arguments)
{
    using namespace Frontier;
    try
    {
        std::setvbuf(stdout, nullptr, _IONBF, 0);
        Require(ArgumentCount >= 5, "usage: SceneViewportWorkspaceCapture <EngineContent> <Projects/Everest> <ShaderRoot> <Out.png> [Refreshes] [Level]");
        const std::filesystem::path ContentDir  = std::filesystem::absolute(Arguments[1]);
        const std::filesystem::path EverestRoot = std::filesystem::absolute(Arguments[2]);
        const std::filesystem::path ShaderRoot  = std::filesystem::absolute(Arguments[3]);
        const std::filesystem::path OutputPath  = std::filesystem::absolute(Arguments[4]);
        const int                   Refreshes   = ArgumentCount > 5 ? std::atoi(Arguments[5]) : 10;
        std::filesystem::create_directories(OutputPath.parent_path());

        ImGui::CreateContext();
        ImGuiIO& Io    = ImGui::GetIO();
        Io.DisplaySize = ImVec2(static_cast<float>(CaptureWidth), static_cast<float>(CaptureHeight));
        Io.DeltaTime   = 1.0f / 30.0f;
        Io.IniFilename = nullptr;
        Io.BackendFlags |= ImGuiBackendFlags_RendererHasTextures | ImGuiBackendFlags_RendererHasVtxOffset;
        ImGui::GetPlatformIO().Renderer_TextureMaxWidth  = 4096;
        ImGui::GetPlatformIO().Renderer_TextureMaxHeight = 4096;
        IconPresentation::Attach(ContentDir / "Icons");
        const std::filesystem::path Preferences = OutputPath.parent_path() / "Personal.projectspace";
        std::filesystem::remove(Preferences);
        ActivationOwnership Ownership(new ControlCentrePanel(ContentDir / "FontArchives", Preferences, EverestRoot / "Everest.projectspace"));
        auto* Centre = static_cast<ControlCentrePanel*>(Ownership.get());
        Require(Centre->Initialize() && Centre->Activate(), "ControlCentrePanel initialization failed");

        // 📝 The same bridge the editor uses; here it opens its own device and the image comes back to the CPU.
        Everest::EverestWorkspace     Workspace(*Centre, EverestRoot);
        Everest::EverestSceneViewport Bridge(EverestRoot, ShaderRoot, nullptr);
        std::vector<uint8_t>          ViewportPixels;
        std::array<uint32_t, 2>       ViewportExtent = {0, 0};
        std::string                   LastStatus;
        Workspace.PresentSceneViewport = [&](const Everest::SceneViewportRequest& Request) {
            const auto Start = std::chrono::steady_clock::now();
            const Everest::SceneViewportRefresh Outcome = Bridge.Render(Request, Workspace.QuerySceneWorld(), Workspace.QueryElapsedSeconds());
            Everest::SceneViewportImage Image;
            Image.Status  = Outcome.Status;
            Image.Readout = Outcome.Readout;
            LastStatus    = Outcome.Status;
            if (Outcome.View != VK_NULL_HANDLE && Bridge.AccessViewport()->ReadPresented(ViewportPixels))
            {
                ViewportExtent = Outcome.Extent;
                Image.Texture  = ViewportTag;
            }
            std::printf("  viewport image %u x %u for a %.0f x %.0f panel in %.1f s — %s\n", Outcome.Extent[0], Outcome.Extent[1], Request.PanelWidth,
                        Request.PanelHeight, std::chrono::duration<double>(std::chrono::steady_clock::now() - Start).count(), Outcome.Status.c_str());
            return Image;
        };

        // 📝 The capture shows the demo's readout (H) and distance slice (I), which the editor starts with off.
        Workspace.AccessViewportOverlays().ReadoutVisible       = true;
        for (int Tick = 0; Tick < Refreshes; ++Tick)
        {
            Centre->PrepareInterface();
            ImGui::NewFrame();
            (void)Centre->Integrate(1.0 / 30.0);
            (void)Workspace.ConfigurePlatform();
            Workspace.ConstructInterface(1.0 / 30.0);
            Centre->ConstructInterface();
            ImGui::Render();
            FrontierExhibit::AcknowledgeTextures();
        }
        Require(!ViewportPixels.empty(), "no scene viewport image was presented: " + LastStatus);

        const auto WriteCapture = [&](const std::filesystem::path& Target) {
            const ImDrawData* DrawData = ImGui::GetDrawData();
            std::vector<unsigned char> Pixels(static_cast<size_t>(CaptureWidth) * CaptureHeight * 3u, 14u);
            const std::function<FrontierExhibit::Image(ImTextureID)> Resolve = [&](ImTextureID Texture) {
                return Texture == ViewportTag ? FrontierExhibit::Image{ViewportPixels.data(), static_cast<int>(ViewportExtent[0]), static_cast<int>(ViewportExtent[1]), 4}
                                              : FrontierExhibit::Image{};
            };
            for (const ImDrawList* List : DrawData->CmdLists)
                FrontierExhibit::RasterizeCommands(List, Pixels.data(), CaptureWidth, CaptureHeight, DrawData->DisplayPos, DrawData->FramebufferScale, nullptr,
                                                   &Resolve);
            Require(stbi_write_png(Target.string().c_str(), CaptureWidth, CaptureHeight, 3, Pixels.data(), CaptureWidth * 3) != 0, "PNG write failed");
            std::printf("[SceneViewportWorkspaceCapture] %s (viewport %u x %u)\n", Target.string().c_str(), ViewportExtent[0], ViewportExtent[1]);
        };
        WriteCapture(OutputPath);

        // 📝 The viewport bar's inspection select writes the RenderPipeline record; the next refresh reads it. Here the record
        //    is set to the demo's "Normals" view (8) and one more refresh is captured beside the main image.
        if (auto* Pipeline = dynamic_cast<RenderPipelineRecord*>(Workspace.QuerySceneWorld().FindFirstByType("RenderPipeline")))
        {
            Pipeline->AccessConfiguration().InspectionModeIndex = 8;
            Pipeline->AccessConfiguration().AdvanceRevision();
            Centre->PrepareInterface();
            ImGui::NewFrame();
            (void)Centre->Integrate(1.0 / 30.0);
            Workspace.ConstructInterface(1.0 / 30.0);
            Centre->ConstructInterface();
            ImGui::Render();
            FrontierExhibit::AcknowledgeTextures();
            std::filesystem::path Normals = OutputPath;
            Normals.replace_filename(OutputPath.stem().string() + "-Normals" + OutputPath.extension().string());
            WriteCapture(Normals);
        }

        Workspace.PresentSceneViewport = nullptr;
        Ownership.reset();
        FrontierExhibit::AcknowledgeTextures();
        ImGui::GetIO().BackendFlags = 0;
        ImGui::DestroyContext();
        return 0;
    }
    catch (const std::exception& Failure)
    {
        std::fprintf(stderr, "[SceneViewportWorkspaceCapture] FAILED: %s\n", Failure.what());
        return 1;
    }
}
