/*==========================================================================================================================================
                                                            EVERESTGLFWMAIN.CPP
==========================================================================================================================================*/
// 🧩 GLFW + Vulkan 1.1 interactive front-end for Project Everest:
//    Hosts the Frontier Editor (Outliner + 3D GPU SDF World + GasCardSurface Inspector), seamless 1:1 C++ FluidEditor
//    ("Fluid — Frontier Experimental"), Lobby & Proving Grounds navigation, ControlVehicle driving, and 4-wheel tyre smoke & fire.
//    Zero OpenGL dependencies.
//
//      EverestWindow [--archive DIR] [--proving-grounds] [--fluid-editor] [--preset ID] [--frames N] [--capture PATH.png]

#include "Frontier/Engine/Editor/FrontierEditorWorkspace.h"
#include "Frontier/Engine/Input/InputEncoder.h"
#include "Frontier/Engine/Rendering/PngImageCodec.h"
#include "Frontier/Engine/Rendering/VulkanContext.h"
#include "Frontier/Engine/Session/LobbySession.h"
#include "Frontier/Game/CameraController.h"
#include "Projects/Everest/Source/Navigation/NavigationApp.h"
#include "Projects/Everest/Source/Session/SessionPolicy.h"

#ifndef GLFW_INCLUDE_NONE
#define GLFW_INCLUDE_NONE
#endif
#define GLFW_INCLUDE_VULKAN
#include <GLFW/glfw3.h>
#include <backends/imgui_impl_glfw.h>
#include <imgui.h>

#include <algorithm>
#include <cstdio>
#include <cstring>
#include <filesystem>
#include <string>
#include <vector>

namespace
{

std::string LocateFacetArchiveDir(const std::string& OverrideDir)
{
    if (!OverrideDir.empty() && std::filesystem::exists(OverrideDir + "/ControlVehicleBody.facet"))
        return OverrideDir;

    const char* Candidates[] = {
        "Experimental/VehicleHmiPrototype/Archive",
        "../Experimental/VehicleHmiPrototype/Archive",
        "../../Experimental/VehicleHmiPrototype/Archive",
    };
    for (const char* Dir : Candidates)
    {
        if (std::filesystem::exists(std::string(Dir) + "/ControlVehicleBody.facet"))
            return Dir;
    }
    return OverrideDir.empty() ? "Experimental/VehicleHmiPrototype/Archive" : OverrideDir;
}

bool CreateGlfwWindowSurfaceCallback(VkInstance Instance, void* UserData, VkSurfaceKHR& OutSurface)
{
    auto* Window = static_cast<GLFWwindow*>(UserData);
    return glfwCreateWindowSurface(Instance, Window, nullptr, &OutSurface) == VK_SUCCESS;
}

} // namespace

int main(int ArgumentCount, char** Arguments)
{
    using namespace Frontier;

    std::string ArchiveDirectory = "";
    std::string InitialPresetId  = "";
    std::string CapturePngPath   = "";
    bool StartInProvingGrounds   = false;
    bool StartInFluidEditor      = false;
    int MaxFrames                = 0;

    for (int Index = 1; Index < ArgumentCount; ++Index)
    {
        if (std::strcmp(Arguments[Index], "--archive") == 0 && Index + 1 < ArgumentCount)
            ArchiveDirectory = Arguments[++Index];
        else if (std::strcmp(Arguments[Index], "--preset") == 0 && Index + 1 < ArgumentCount)
            InitialPresetId = Arguments[++Index];
        else if (std::strcmp(Arguments[Index], "--capture") == 0 && Index + 1 < ArgumentCount)
            CapturePngPath = Arguments[++Index];
        else if (std::strcmp(Arguments[Index], "--frames") == 0 && Index + 1 < ArgumentCount)
            MaxFrames = std::atoi(Arguments[++Index]);
        else if (std::strcmp(Arguments[Index], "--proving-grounds") == 0)
            StartInProvingGrounds = true;
        else if (std::strcmp(Arguments[Index], "--fluid-editor") == 0)
            StartInFluidEditor = true;
    }

    ArchiveDirectory            = LocateFacetArchiveDir(ArchiveDirectory);
    const FacetArchiveData Body = LoadFacetArchive(ArchiveDirectory + "/ControlVehicleBody.facet");
    const FacetArchiveData Tyre = LoadFacetArchive(ArchiveDirectory + "/ControlVehicleTyre.facet");
    const FacetArchiveData Rim  = LoadFacetArchive(ArchiveDirectory + "/ControlVehicleRim.facet");
    if (!Body.IsValid() || !Tyre.IsValid() || !Rim.IsValid())
    {
        std::fprintf(stderr, "EverestWindow: vehicle facet archives not found or invalid under %s\n", ArchiveDirectory.c_str());
        return 1;
    }

    if (!glfwInit())
    {
        std::fprintf(stderr, "EverestWindow: GLFW initialization failed\n");
        return 1;
    }

    if (!glfwVulkanSupported())
    {
        std::fprintf(stderr, "EverestWindow: GLFW reports Vulkan loader is not available on this host\n");
        glfwTerminate();
        return 1;
    }

    glfwWindowHint(GLFW_CLIENT_API, GLFW_NO_API);
    glfwWindowHint(GLFW_RESIZABLE, GLFW_TRUE);

    GLFWwindow* Window = glfwCreateWindow(1440, 860, "Project Everest — Frontier Editor & Fluid (Vulkan)", nullptr, nullptr);
    if (!Window)
    {
        std::fprintf(stderr, "EverestWindow: could not create GLFW window\n");
        glfwTerminate();
        return 1;
    }
    glfwSetInputMode(Window, GLFW_CURSOR, GLFW_CURSOR_NORMAL);

    uint32_t ReqExtCount    = 0u;
    const char** ReqExtList = glfwGetRequiredInstanceExtensions(&ReqExtCount);
    int InitialFbW = 1440, InitialFbH = 860;
    glfwGetFramebufferSize(Window, &InitialFbW, &InitialFbH);

    VulkanContext VkCtx{};
    std::string VkDiagnostic;
    if (!VkCtx.InitializeWithSurface(ReqExtList, ReqExtCount, &CreateGlfwWindowSurfaceCallback, Window,
                                     std::max(1, InitialFbW), std::max(1, InitialFbH), VkDiagnostic))
    {
        std::fprintf(stderr, "EverestWindow: Vulkan initialization failed: %s\n", VkDiagnostic.c_str());
        glfwDestroyWindow(Window);
        glfwTerminate();
        return 1;
    }

    IMGUI_CHECKVERSION();
    ImGui::CreateContext();
    ImGuiIO& Io    = ImGui::GetIO();
    Io.IniFilename = nullptr;

    FrontierEditorWorkspace Editor{};
    Editor.LoadDefaultFonts();

    ImGui_ImplGlfw_InitForVulkan(Window, true);
    VulkanImGuiPresenter GuiPresenter{};
    if (!GuiPresenter.Initialize(VkCtx, VkCtx.QueryTargetSwapchainClear(), VkDiagnostic))
    {
        std::fprintf(stderr, "EverestWindow: Vulkan ImGui presenter failed: %s\n", VkDiagnostic.c_str());
        ImGui_ImplGlfw_Shutdown();
        ImGui::DestroyContext();
        VkCtx.Shutdown();
        glfwDestroyWindow(Window);
        glfwTerminate();
        return 1;
    }

    if (!Editor.Initialize(VkCtx, &Body, &Tyre, &Rim, VkDiagnostic))
    {
        std::fprintf(stderr, "EverestWindow: FrontierEditorWorkspace failed: %s\n", VkDiagnostic.c_str());
        GuiPresenter.Shutdown(VkCtx);
        ImGui_ImplGlfw_Shutdown();
        ImGui::DestroyContext();
        VkCtx.Shutdown();
        glfwDestroyWindow(Window);
        glfwTerminate();
        return 1;
    }

    SessionConfiguration Configuration{};
    LobbySession Game(Configuration, Everest::ConstructEverestSessionPolicy);
    Everest::NavigationApp Navigation(Configuration);
    InputEncoder Encoder;
    CameraController Camera;
    static const InputRoutingPolicy FallbackRouting{};

    if (StartInProvingGrounds)
        Navigation.Navigate(Game, 2u);
    if (StartInFluidEditor)
        Editor.OpenFluidEditorForPlume(1u);
    if (!InitialPresetId.empty() && Editor.AccessPlumes().size() > 1u)
    {
        PyroVolumeSolver* TargetSolver = Editor.AccessPlumes()[1].Solver.get();
        if (TargetSolver)
            Editor.AccessFluidEditor().LoadPresetByIdentity(VkCtx, *TargetSolver, InitialPresetId.c_str());
    }

    double PreviousTime = glfwGetTime();
    float SmoothedFps   = 60.0f;
    int FrameCounter    = 0;

    while (!glfwWindowShouldClose(Window))
    {
        glfwPollEvents();
        const double Now = glfwGetTime();
        const float Step = std::clamp(static_cast<float>(Now - PreviousTime), 1.0f / 240.0f, 1.0f / 20.0f);
        PreviousTime     = Now;
        SmoothedFps      = SmoothedFps * 0.90f + (1.0f / std::max(Step, 1.0e-4f)) * 0.10f;

        if (!Editor.IsFluidEditorOpen())
        {
            const SessionPolicy* Policy       = Game.QuerySession().QueryPolicy();
            const InputRoutingPolicy& Routing = Policy ? Policy->QueryInputRoutingPolicy() : FallbackRouting;
            const InputControlMode Mode       = (Routing.AllowDriving && Editor.WantsVehicleDrivingInput())
                                              ? InputControlMode::Driving : InputControlMode::Navigation;
            InputPacket Packet                = Encoder.SampleGlfwWindow(Window, Step, Mode);
            Packet.LookYawDelta               = 0.0f;
            Packet.LookPitchDelta             = 0.0f;
            Packet                            = Routing.Route(Packet);
            if (!Encoder.WasActionPressed(InputActionResetUnit))
                Packet.ActionBits &= ~static_cast<uint32_t>(InputActionResetUnit);

            if (Editor.AccessTyreIntake().BurnoutLineLock && Packet.ThrottleAxis > 0.05f)
            {
                Packet.BrakeAxis     = 0.85f;
                Packet.HandbrakeAxis = 1.0f;
            }

            Game.SubmitLocalInput(Packet);
            Game.Step(Step);

            const SessionPolicy* UpdatedPolicy       = Game.QuerySession().QueryPolicy();
            const InputRoutingPolicy& UpdatedRouting = UpdatedPolicy ? UpdatedPolicy->QueryInputRoutingPolicy() : FallbackRouting;
            InputPacket CameraPacket                 = Packet;
            if (!Encoder.WasActionPressed(InputActionCycleCamera))
                CameraPacket.ActionBits &= ~static_cast<uint32_t>(InputActionCycleCamera);
            Camera.Step(CameraPacket, UpdatedRouting, Game.QueryLocalVehicle());
        }

        int WinW = 1, WinH = 1, FbW = 1, FbH = 1;
        glfwGetWindowSize(Window, &WinW, &WinH);
        glfwGetFramebufferSize(Window, &FbW, &FbH);
        if (FbW <= 0 || FbH <= 0)
            continue;

        ImGui_ImplGlfw_NewFrame();
        ImGui::NewFrame();

        ImGui::SetNextWindowPos({ 0.0f, 0.0f });
        ImGui::SetNextWindowSize({ static_cast<float>(WinW), static_cast<float>(WinH) });
        ImGui::PushStyleVar(ImGuiStyleVar_WindowPadding, { 0.0f, 0.0f });
        ImGui::PushStyleVar(ImGuiStyleVar_WindowBorderSize, 0.0f);
        ImGui::Begin("##FrontierRoot", nullptr,
                     ImGuiWindowFlags_NoDecoration | ImGuiWindowFlags_NoMove |
                     ImGuiWindowFlags_NoSavedSettings | ImGuiWindowFlags_NoBringToFrontOnFocus);

        Editor.TickAndDraw(VkCtx, Game, Navigation, Camera, Step, SmoothedFps,
                           { 0.0f, 0.0f }, { static_cast<float>(WinW), static_cast<float>(WinH) });

        ImGui::End();
        ImGui::PopStyleVar(2);
        ImGui::Render();

        GuiPresenter.SyncManagedTextures(VkCtx);

        VkCommandBuffer SwapCmd = VK_NULL_HANDLE;
        VkFramebuffer SwapFbo   = VK_NULL_HANDLE;
        VkExtent2D SwapExtent   = { 0u, 0u };
        if (VkCtx.BeginSwapchainFrame(FbW, FbH, SwapCmd, SwapFbo, SwapExtent))
        {
            const int ExtW = static_cast<int>(SwapExtent.width);
            const int ExtH = static_cast<int>(SwapExtent.height);
            const std::array<float, 4> ClearCol = { 0.04f, 0.04f, 0.04f, 1.0f };
            VkCtx.BeginTarget(SwapCmd, VkCtx.QueryTargetSwapchainClear(), SwapFbo, ExtW, ExtH, &ClearCol, false);
            GuiPresenter.RecordDrawData(VkCtx, SwapCmd, ImGui::GetDrawData(), ExtW, ExtH);
            VkCtx.EndTarget(SwapCmd);
            VkCtx.EndAndPresentSwapchainFrame(FbW, FbH);
        }

        if (!CapturePngPath.empty() && MaxFrames > 0 && FrameCounter + 1 >= MaxFrames)
        {
            VulkanImageTarget OffscreenCap{};
            std::string CapDiag;
            if (VkCtx.CreateImageTarget(FbW, FbH, VK_FORMAT_R8G8B8A8_UNORM,
                                        VK_IMAGE_USAGE_COLOR_ATTACHMENT_BIT, false, OffscreenCap, CapDiag))
            {
                VulkanImGuiPresenter CapPresenter{};
                if (CapPresenter.Initialize(VkCtx, VkCtx.QueryTargetSingleRgba8Clear(), CapDiag))
                {
                    CapPresenter.SyncManagedTextures(VkCtx);
                    const VulkanImageTarget* Att[1] = { &OffscreenCap };
                    VkFramebuffer CapFbo = VkCtx.CreateFramebuffer(VkCtx.QueryTargetSingleRgba8Clear(), Att, 1u, FbW, FbH);
                    VkCommandBuffer CapCmd = VkCtx.BeginFrameCommands();
                    VkCtx.TransitionImage(CapCmd, OffscreenCap, VK_IMAGE_LAYOUT_COLOR_ATTACHMENT_OPTIMAL);
                    const std::array<float, 4> ClearCol = { 0.04f, 0.04f, 0.04f, 1.0f };
                    VkCtx.BeginTarget(CapCmd, VkCtx.QueryTargetSingleRgba8Clear(), CapFbo, FbW, FbH, &ClearCol, false);
                    CapPresenter.RecordDrawData(VkCtx, CapCmd, ImGui::GetDrawData(), FbW, FbH);
                    VkCtx.EndTarget(CapCmd);
                    VkCtx.SubmitAndWaitFrameCommands();

                    std::vector<uint8_t> Pixels;
                    if (VkCtx.DownloadRgba8Image(OffscreenCap, Pixels))
                        WriteRgbaPngFile(CapturePngPath, Pixels.data(), FbW, FbH);
                    VkCtx.DestroyFramebuffer(CapFbo);
                    CapPresenter.Shutdown(VkCtx);
                }
                VkCtx.DestroyImageTarget(OffscreenCap);
            }
        }

        ++FrameCounter;
        if (MaxFrames > 0 && FrameCounter >= MaxFrames)
            break;
    }

    VkCtx.WaitIdle();
    Editor.Shutdown(VkCtx);
    GuiPresenter.Shutdown(VkCtx);
    ImGui_ImplGlfw_Shutdown();
    ImGui::DestroyContext();
    VkCtx.Shutdown();
    glfwDestroyWindow(Window);
    glfwTerminate();
    return 0;
}
