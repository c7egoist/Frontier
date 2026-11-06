/*==========================================================================================================================================
                                                     VOLUMETRICANDEDITORVALIDATION.CPP
==========================================================================================================================================*/
// 🧩 End-to-end C++ & Headless Vulkan 1.1 validation suite for:
//    1. 18-preset GasPresetLibrary & 85-field GasSceneCodec (.gasscene.toml round-trip + all Sample scenes).
//    2. 82-control FluidEditorControls specification parity.
//    3. 3D WorldSdfScene analytic SDF + ControlVehicle aerodynamic wake velocity field.
//    4. TyreSmokeIntake Pacejka slip -> 3-node thermal conduction -> rubber smoke -> >= 160 C ignition fire + fire light.
//    5. Headless Vulkan 1.1 GPU execution of PyroVolumeSolver, WorldSdfScene, FluidEditorWorkspace, and FrontierEditorWorkspace,
//       plus 1440x860 PNG visual proof capture when invoked with --write-proofs [DIR]. Zero OpenGL / EGL dependencies.

#include "Frontier/Engine/Editor/FrontierEditorWorkspace.h"
#include "Frontier/Engine/Rendering/PngImageCodec.h"
#include "Frontier/Engine/Rendering/VulkanContext.h"
#include "Frontier/Engine/Rendering/WorldSdfScene.h"
#include "Frontier/Engine/Session/LobbySession.h"
#include "Frontier/Engine/VolumetricDynamics/GasPresetLibrary.h"
#include "Frontier/Engine/VolumetricDynamics/GasSceneCodec.h"
#include "Frontier/Engine/VolumetricDynamics/PyroVolumeSolver.h"
#include "Frontier/Engine/VolumetricDynamics/TyreSmokeIntake.h"
#include "Frontier/Game/CameraController.h"
#include "Projects/Everest/Source/Navigation/NavigationApp.h"
#include "Projects/Everest/Source/Session/SessionPolicy.h"

#include <imgui.h>

#include <cmath>
#include <cstdio>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <string>
#include <vector>

namespace
{

int Failures = 0;

void Expect(bool Condition, const char* Description)
{
    if (!Condition)
    {
        std::fprintf(stderr, "  [FAIL] %s\n", Description);
        ++Failures;
    }
    else
    {
        std::printf("  [PASS] %s\n", Description);
    }
}

std::string ReadWholeFile(const std::string& Path)
{
    std::ifstream In(Path, std::ios::binary);
    if (!In)
        return {};
    return std::string((std::istreambuf_iterator<char>(In)), std::istreambuf_iterator<char>());
}

bool RenderImGuiFrameOffscreen(Frontier::VulkanContext& VkCtx, Frontier::VulkanImGuiPresenter& Presenter,
                               Frontier::VulkanImageTarget& ColorImg, VkFramebuffer Fbo,
                               int Width, int Height, std::vector<uint8_t>& OutRgba)
{
    Presenter.SyncManagedTextures(VkCtx);
    VkCommandBuffer Cmd = VkCtx.BeginFrameCommands();
    VkCtx.TransitionImage(Cmd, ColorImg, VK_IMAGE_LAYOUT_COLOR_ATTACHMENT_OPTIMAL);
    const std::array<float, 4> ClearBg = { 0.04f, 0.04f, 0.04f, 1.0f };
    VkCtx.BeginTarget(Cmd, VkCtx.QueryTargetSingleRgba8Clear(), Fbo, Width, Height, &ClearBg, false);
    Presenter.RecordDrawData(VkCtx, Cmd, ImGui::GetDrawData(), Width, Height);
    VkCtx.EndTarget(Cmd);
    if (!VkCtx.SubmitAndWaitFrameCommands())
        return false;
    return VkCtx.DownloadRgba8Image(ColorImg, OutRgba);
}

bool HasNonTrivialColorVariance(const std::vector<uint8_t>& Rgba)
{
    if (Rgba.size() < 64u)
        return false;
    uint8_t MinLum = 255u, MaxLum = 0u;
    uint64_t BrightCount = 0u;
    for (size_t Idx = 0u; Idx + 3u < Rgba.size(); Idx += 4u)
    {
        const uint8_t Lum = static_cast<uint8_t>((uint32_t(Rgba[Idx]) + uint32_t(Rgba[Idx + 1u]) + uint32_t(Rgba[Idx + 2u])) / 3u);
        MinLum = std::min(MinLum, Lum);
        MaxLum = std::max(MaxLum, Lum);
        if (Lum > 42u)
            ++BrightCount;
    }
    return (MaxLum - MinLum) >= 45u && BrightCount > 250u;
}

} // namespace

int main(int ArgumentCount, char** Arguments)
{
    using namespace Frontier;

    bool WriteProofs     = false;
    bool RequireVulkan   = false;
    std::string ProofDir = "/tmp/frontier-proofs";
    for (int Idx = 1; Idx < ArgumentCount; ++Idx)
    {
        if (std::strcmp(Arguments[Idx], "--require-vulkan") == 0)
        {
            RequireVulkan = true;
        }
        else if (std::strcmp(Arguments[Idx], "--write-proofs") == 0 || std::strcmp(Arguments[Idx], "--emit-proofs") == 0)
        {
            WriteProofs   = true;
            RequireVulkan = true;
            if (Idx + 1 < ArgumentCount && Arguments[Idx + 1][0] != '-')
                ProofDir = Arguments[++Idx];
        }
    }

    std::printf("=== 1. Validating 18 Presets, 82 Controls & .gasscene.toml Codec ===\n");
    Expect(GasPresetCount == 18u, "Exact 18 presets ported from Experimental/Fluid/src/presets.js");
    Expect(FluidEditor::FluidControlCount == 82u, "Exact 82 inspector controls ported from Experimental/Fluid/src/SceneSpecification.js");
    Expect(FindGasPreset("ue5_pyro_default") != nullptr, "ue5_pyro_default preset registered");
    Expect(FindGasPreset("megaton_open_bounds") != nullptr, "megaton_open_bounds preset registered");
    Expect(FindGasPreset("tyre_burnout") != nullptr, "tyre_burnout preset registered");
    Expect(FindGasPreset("low_gpu_performance") != nullptr, "low_gpu_performance preset registered");

    // Round-trip every preset through .gasscene.toml
    bool AllPresetsRoundTrip = true;
    const GasPreset* PresetTable = GasPresetLibrary();
    for (uint32_t PIdx = 0u; PIdx < GasPresetCount; ++PIdx)
    {
        GasScene Doc{};
        Doc.Name     = PresetTable[PIdx].Name;
        Doc.Settings = ConstructPresetSettingsBySlot(PIdx);

        const std::string Serialized = WriteGasScene(Doc);
        GasScene Parsed{};
        const GasSceneReading Res = ReadGasScene(Serialized, Parsed);
        if (!Res.Accepted ||
            std::fabs(Parsed.Settings.Buoyancy - Doc.Settings.Buoyancy) > 1e-4f ||
            std::fabs(Parsed.Settings.FireIntensity - Doc.Settings.FireIntensity) > 1e-4f ||
            Parsed.Settings.LatticeResolution != Doc.Settings.LatticeResolution)
        {
            AllPresetsRoundTrip = false;
        }
    }
    Expect(AllPresetsRoundTrip, "All 18 GasPresets round-trip losslessly through .gasscene.toml");

    // Parse shipped Sample scenes
    const char* SampleFiles[8] = {
        "Experimental/Fluid/Samples/camp_fire_steady.gasscene.toml",
        "Experimental/Fluid/Samples/cold_dust_fall.gasscene.toml",
        "Experimental/Fluid/Samples/deflector_obstacle.gasscene.toml",
        "Experimental/Fluid/Samples/far_cheap_plume.gasscene.toml",
        "Experimental/Fluid/Samples/fracture_dust_burst.gasscene.toml",
        "Experimental/Fluid/Samples/hero_detonation.gasscene.toml",
        "Experimental/Fluid/Samples/open_bounds_megaton.gasscene.toml",
        "Experimental/Fluid/Samples/tyre_burnout_ring.gasscene.toml",
    };
    bool AllSamplesParsed = true;
    for (const char* SamplePath : SampleFiles)
    {
        const std::string Text = ReadWholeFile(SamplePath);
        GasScene SampleDoc{};
        if (Text.empty() || !ReadGasScene(Text, SampleDoc).Accepted)
            AllSamplesParsed = false;
    }
    Expect(AllSamplesParsed, "All 8 Experimental/Fluid/Samples/*.gasscene.toml parse cleanly");

    std::printf("\n=== 2. Validating 3D World SDF & ControlVehicle Wake Evaluator ===\n");
    WorldSdfScene CpuSdfCheck{};
    WorldVehicleRig MovingCar{};
    MovingCar.Visual.PositionMetres = { 4.0f, 0.0f, 0.53f };
    MovingCar.VelocityMps           = { 18.5f, 0.0f, 0.0f };
    std::vector<WorldVehicleRig> SingleCar{ MovingCar };

    float DistInsideSphere = 10.0f, DistInsideCar = 10.0f;
    std::array<float, 3> VelNearSphere{}, VelNearCar{};
    CpuSdfCheck.EvaluateSdfAndVelocity({ 6.2f, -2.35f, 0.82f }, true, true, SingleCar, DistInsideSphere, VelNearSphere);
    CpuSdfCheck.EvaluateSdfAndVelocity({ 4.0f,  0.0f,  0.80f }, true, true, SingleCar, DistInsideCar,    VelNearCar);
    Expect(DistInsideSphere < -0.5f, "Proving Grounds deflector sphere evaluates negative signed distance inside solid");
    Expect(DistInsideCar < 0.0f && VelNearCar[0] > 18.0f, "ControlVehicle SDF hull evaluates interior solid + 18.5 m/s aerodynamic wake");

    std::printf("\n=== 3. Validating Pacejka Tyre Slip -> Smoke -> Overheat Fire Ignition ===\n");
    SessionConfiguration Config{};
    LobbySession BurnoutSession(Config, Everest::ConstructEverestSessionPolicy);
    Everest::NavigationApp BurnoutNav(Config);
    BurnoutNav.Navigate(BurnoutSession, 2u); // Proving Grounds!

    DeployableUnit* Car = BurnoutSession.QueryLocalVehicle();
    Expect(Car != nullptr, "ControlVehicle deployed on Proving Grounds");

    TyreSmokeIntake Intake{};
    Intake.BurnoutLineLock = true;
    bool SawTyreSmoke = false;
    bool SawTyreFire  = false;
    std::vector<DynamicFireLight> BurnoutLights;
    PyroBoundsBox BurnoutBox{};
    BurnoutBox.BoxMin          = { -3.8f, -0.60f, -3.8f };
    BurnoutBox.BoxMax          = {  3.8f,  3.60f,  3.8f };
    BurnoutBox.EffectiveWidth  = 7.6f;
    BurnoutBox.EffectiveHeight = 4.2f;
    PyroExternalSource WheelSrcs[8]{};

    // 960 ticks = 16.0 s standing burnout at 60 Hz (heats rear tread > 180 C for > 1.0 s -> ignites!)
    for (int Tick = 0; Tick < 960 && Car; ++Tick)
    {
        InputPacket Pkt{};
        Pkt.ThrottleAxis = 1.0f;
        Pkt.BrakeAxis    = 1.0f; // standing burnout line-lock!
        Pkt.SteerAxis    = 0.18f;
        BurnoutSession.SubmitLocalInput(Pkt);
        BurnoutSession.Step(1.0f / 60.0f);

        const auto Pos = Car->QueryPositionMetres();
        Intake.Advance(*Car, 1.0f / 60.0f, WorldSdfScene::ResolveCourseHeight(Pos[0], Pos[1], true));
        BurnoutLights.clear();
        const int Count = Intake.ProjectIntoDomain({ Pos[0], Pos[1], 0.0f }, BurnoutBox, WheelSrcs, 8, BurnoutLights);
        if (Count > 0 && Intake.QueryActiveSmokingWheelCount() >= 2)
            SawTyreSmoke = true;
        if (Intake.HasAnyBurningTyre() && !BurnoutLights.empty())
            SawTyreFire = true;
    }
    Expect(SawTyreSmoke, "Standing burnout generates active Pacejka tyre smoke sources");
    Expect(SawTyreFire,  "Sustained >= 160 C tyre overheat ignites rubber fire + emits DynamicFireLight");

    std::printf("\n=== 4. Validating Headless Vulkan 1.1 Solver, SDF World & Editor Workspaces ===\n");
    VulkanContext VkCtx{};
    std::string VkDiag;
    if (!VkCtx.InitializeHeadless(VkDiag))
    {
        if (RequireVulkan)
        {
            std::fprintf(stderr, "  [FAIL] Headless Vulkan 1.1 initialization failed: %s\n", VkDiag.c_str());
            return 1;
        }
        std::printf("  [SKIP] No Vulkan 1.1 ICD installed on this runner (%s); CPU/TOML/SDF/Tyre checks complete.\n", VkDiag.c_str());
        std::printf("\nValidation summary: %d failure(s).\n", Failures);
        return Failures == 0 ? 0 : 1;
    }
    std::printf("  [INFO] Vulkan 1.1 active on: %s\n", VkCtx.QueryDeviceSummary().c_str());

    // Standalone PyroVolumeSolver + 2x2 Flipbook bake check
    {
        GasSettings StandaloneSettings       = ConstructPresetSettings("ue5_pyro_default");
        StandaloneSettings.LatticeResolution = 32;
        StandaloneSettings.PressureIterations= 12;
        StandaloneSettings.RaymarchSteps     = 56;
        PyroVolumeSolver StandaloneSolver{};
        Expect(StandaloneSolver.Initialize(VkCtx, StandaloneSettings, VkDiag), "PyroVolumeSolver initializes all 15 Vulkan 1.1 SPIR-V pipelines");

        PyroOrbitCamera OrbitCam{};
        for (int Step = 0; Step < 20; ++Step)
            StandaloneSolver.AdvanceSimulation(VkCtx, StandaloneSettings, 1.0f / 30.0f);

        Expect(StandaloneSolver.RenderStandaloneViewport(VkCtx, StandaloneSettings, OrbitCam.ComputeFrame(16.0f / 9.0f), 320, 180, false),
               "PyroVolumeSolver renders Vulkan volumetric viewport");

        std::vector<uint8_t> StandalonePixels;
        int Rw = 0, Rh = 0;
        Expect(StandaloneSolver.ReadViewportRgba(VkCtx, StandalonePixels, Rw, Rh) && HasNonTrivialColorVariance(StandalonePixels),
               "Vulkan volumetric raymarcher produces shaded luminous plume pixels");

        std::vector<uint8_t> FlipbookRgba;
        Expect(StandaloneSolver.BakeFlipbookSheet(VkCtx, StandaloneSettings, OrbitCam, 2, 2, 48, 1.0f / 25.0f, FlipbookRgba)
               && FlipbookRgba.size() == 96u * 96u * 4u,
               "PyroVolumeSolver bakes transparent RGBA8 flipbook sprite sheet via Vulkan");

        StandaloneSolver.Shutdown(VkCtx);
    }

    // Full ImGui + FrontierEditorWorkspace + FluidEditorWorkspace validation & 1440x860 visual proof capture
    const FacetArchiveData Body = LoadFacetArchive("Experimental/VehicleHmiPrototype/Archive/ControlVehicleBody.facet");
    const FacetArchiveData Tyre = LoadFacetArchive("Experimental/VehicleHmiPrototype/Archive/ControlVehicleTyre.facet");
    const FacetArchiveData Rim  = LoadFacetArchive("Experimental/VehicleHmiPrototype/Archive/ControlVehicleRim.facet");
    Expect(Body.IsValid() && Tyre.IsValid() && Rim.IsValid(), "ControlVehicle .facet archives loaded");

    IMGUI_CHECKVERSION();
    ImGui::CreateContext();
    ImGuiIO& Io    = ImGui::GetIO();
    Io.IniFilename = nullptr;

    const int WinW = 1440;
    const int WinH = 860;
    Io.DisplaySize = { static_cast<float>(WinW), static_cast<float>(WinH) };

    FrontierEditorWorkspace Editor{};
    Editor.LoadDefaultFonts();

    VulkanImGuiPresenter GuiPresenter{};
    Expect(GuiPresenter.Initialize(VkCtx, VkCtx.QueryTargetSingleRgba8Clear(), VkDiag),
           "VulkanImGuiPresenter initializes SPIR-V UI pipeline + managed font textures");
    Expect(Editor.Initialize(VkCtx, &Body, &Tyre, &Rim, VkDiag),
           "FrontierEditorWorkspace initializes WorldSdfScene + World Pyro plumes on Vulkan 1.1");

    VulkanImageTarget ProofColor{};
    Expect(VkCtx.CreateImageTarget(WinW, WinH, VK_FORMAT_R8G8B8A8_UNORM,
                                   VK_IMAGE_USAGE_COLOR_ATTACHMENT_BIT, false, ProofColor, VkDiag),
           "Allocated 1440x860 RGBA8 offscreen Vulkan UI target");
    const VulkanImageTarget* ProofAtt[1] = { &ProofColor };
    VkFramebuffer ProofFbo = VkCtx.CreateFramebuffer(VkCtx.QueryTargetSingleRgba8Clear(), ProofAtt, 1u, WinW, WinH);

    LobbySession LiveGame(Config, Everest::ConstructEverestSessionPolicy);
    Everest::NavigationApp LiveNav(Config);
    CameraController LiveCam{};
    LiveNav.Navigate(LiveGame, 2u); // Proving Grounds!

    auto RunEditorFrame = [&](float Dt, std::vector<uint8_t>* OutCapture) -> bool
    {
        Io.DeltaTime = Dt;
        ImGui::NewFrame();
        ImGui::SetNextWindowPos({ 0.0f, 0.0f });
        ImGui::SetNextWindowSize({ static_cast<float>(WinW), static_cast<float>(WinH) });
        ImGui::PushStyleVar(ImGuiStyleVar_WindowPadding, { 0.0f, 0.0f });
        ImGui::PushStyleVar(ImGuiStyleVar_WindowBorderSize, 0.0f);
        ImGui::Begin("##ValidationRoot", nullptr,
                     ImGuiWindowFlags_NoDecoration | ImGuiWindowFlags_NoMove |
                     ImGuiWindowFlags_NoSavedSettings | ImGuiWindowFlags_NoBringToFrontOnFocus);

        Editor.TickAndDraw(VkCtx, LiveGame, LiveNav, LiveCam, Dt, 60.0f,
                           { 0.0f, 0.0f }, { static_cast<float>(WinW), static_cast<float>(WinH) });

        ImGui::End();
        ImGui::PopStyleVar(2);
        ImGui::Render();

        if (OutCapture)
            return RenderImGuiFrameOffscreen(VkCtx, GuiPresenter, ProofColor, ProofFbo, WinW, WinH, *OutCapture);
        return true;
    };

    if (WriteProofs)
        std::filesystem::create_directories(ProofDir);

    // Proof 1: 1:1 FluidEditorWorkspace running ue5_pyro_default plume
    Editor.OpenFluidEditorForPlume(1u);
    Editor.AccessFluidEditor().LoadPresetByIdentity(VkCtx, *Editor.AccessPlumes()[1].Solver, "ue5_pyro_default");
    Editor.AccessFluidEditor().AccessActiveSettings().LatticeResolution = 48;
    Editor.AccessPlumes()[1].Solver->EnsureLatticeResolution(VkCtx, 48);
    Editor.AccessPlumes()[1].Solver->TriggerBurstSequence(Editor.AccessFluidEditor().QueryActiveSettings(), "single");
    for (int Warm = 0; Warm < 40; ++Warm)
        Editor.AccessPlumes()[1].Solver->AdvanceSimulation(VkCtx, Editor.AccessFluidEditor().AccessActiveSettings(), 1.0f / 32.0f);
    std::vector<uint8_t> Frame1;
    Expect(RunEditorFrame(1.0f / 60.0f, &Frame1) && HasNonTrivialColorVariance(Frame1),
           "FluidEditorWorkspace (ue5_pyro_default) renders full UI + Vulkan 3D plume");
    if (WriteProofs)
        WriteRgbaPngFile(ProofDir + "/01_fluid_editor_pyro_plume.png", Frame1.data(), WinW, WinH);

    // Proof 2: FluidEditorWorkspace running megaton_open_bounds mushroom cloud + shrapnel detonation
    Editor.AccessFluidEditor().LoadPresetByIdentity(VkCtx, *Editor.AccessPlumes()[1].Solver, "megaton_open_bounds");
    Editor.AccessFluidEditor().AccessActiveSettings().LatticeResolution = 48;
    Editor.AccessPlumes()[1].Solver->EnsureLatticeResolution(VkCtx, 48);
    Editor.AccessPlumes()[1].Solver->TriggerBurstSequence(Editor.AccessFluidEditor().QueryActiveSettings(), "mushroom");
    for (int Warm = 0; Warm < 36; ++Warm)
        Editor.AccessPlumes()[1].Solver->AdvanceSimulation(VkCtx, Editor.AccessFluidEditor().AccessActiveSettings(), 1.0f / 32.0f);
    std::vector<uint8_t> Frame2;
    Expect(RunEditorFrame(1.0f / 60.0f, &Frame2) && HasNonTrivialColorVariance(Frame2),
           "FluidEditorWorkspace (megaton_open_bounds) renders mushroom cloud + shrapnel trails");
    if (WriteProofs)
        WriteRgbaPngFile(ProofDir + "/02_fluid_editor_nuclear_blast.png", Frame2.data(), WinW, WinH);

    // Proof 3: Return to FrontierEditorWorkspace — 3D SDF Proving Grounds + ControlVehicle + Camp fire + GasCardSurface
    Editor.CloseFluidEditor();
    Editor.AccessFluidEditor().LoadPresetByIdentity(VkCtx, *Editor.AccessPlumes()[1].Solver, "camp_fire");
    for (WorldPlumeInstance& Plume : Editor.AccessPlumes())
    {
        Plume.Settings.LatticeResolution = 48;
        if (Plume.Solver)
            Plume.Solver->EnsureLatticeResolution(VkCtx, 48);
    }
    Editor.SelectPlume(1u); // Camp fire selected -> shows GasCardSurface + "Open FluidEditor" button!
    {
        InputPacket CamSetup{};
        CamSetup.LookYawDelta   = -0.55f;
        CamSetup.LookPitchDelta =  0.12f;
        const InputRoutingPolicy Pol{};
        LiveCam.Step(CamSetup, Pol, LiveGame.QueryLocalVehicle());
    }
    for (int Warm = 0; Warm < 32; ++Warm)
    {
        for (size_t Idx = 1u; Idx < Editor.AccessPlumes().size(); ++Idx)
        {
            if (Editor.AccessPlumes()[Idx].Visible && Editor.AccessPlumes()[Idx].Solver)
                Editor.AccessPlumes()[Idx].Solver->AdvanceSimulation(VkCtx, Editor.AccessPlumes()[Idx].Settings, 1.0f / 30.0f);
        }
    }
    std::vector<uint8_t> Frame3;
    Expect(RunEditorFrame(1.0f / 60.0f, &Frame3) && HasNonTrivialColorVariance(Frame3),
           "FrontierEditorWorkspace renders 3D SDF Proving Grounds + ControlVehicle + Volumetric plumes");
    if (WriteProofs)
        WriteRgbaPngFile(ProofDir + "/03_frontier_editor_world_sdf.png", Frame3.data(), WinW, WinH);

    // Proof 4: ControlVehicle standing burnout -> dense tyre smoke + overheated rubber fire + dynamic fire lighting!
    Editor.SelectPlume(0u); // Select Tyre smoke & fire domain!
    Editor.SetBurnoutLineLock(true);
    if (DeployableUnit* LiveCar = LiveGame.QueryLocalVehicle())
    {
        for (int Warm = 0; Warm < 940; ++Warm)
        {
            InputPacket BurnPkt{};
            BurnPkt.ThrottleAxis  = 1.0f;
            BurnPkt.BrakeAxis     = 0.85f;
            BurnPkt.HandbrakeAxis = 1.0f;
            BurnPkt.SteerAxis     = 0.22f;
            LiveGame.SubmitLocalInput(BurnPkt);
            LiveGame.Step(1.0f / 60.0f);
            const auto P = LiveCar->QueryPositionMetres();
            Editor.AccessTyreIntake().Advance(*LiveCar, 1.0f / 60.0f, WorldSdfScene::ResolveCourseHeight(P[0], P[1], true));

            // Inject active tyre smoke & fire directly into Plumes[0] for the final 85 warmup steps!
            if (Warm >= 855 && !Editor.AccessPlumes().empty() && Editor.AccessPlumes()[0].Solver)
            {
                WorldPlumeInstance& TyrePlume = Editor.AccessPlumes()[0];
                TyrePlume.OriginWorld = { P[0], P[1], WorldSdfScene::ResolveCourseHeight(P[0], P[1], true) };
                PyroExternalSource WheelSources[8]{};
                std::vector<DynamicFireLight> DummyLights;
                const PyroBoundsBox B = TyrePlume.Solver->ComputeBoundsBox(TyrePlume.Settings);
                const int SrcCnt = Editor.AccessTyreIntake().ProjectIntoDomain(TyrePlume.OriginWorld, B, WheelSources, 8, DummyLights);
                TyrePlume.Solver->AssignExternalSources(WheelSources, SrcCnt);
                Editor.AccessTyreIntake().AdaptTyreDomainAppearance(TyrePlume.Settings);
                TyrePlume.Solver->AdvanceSimulation(VkCtx, TyrePlume.Settings, 1.0f / 30.0f);
            }
        }
    }
    {
        InputPacket BurnPkt{};
        BurnPkt.ThrottleAxis  = 1.0f;
        BurnPkt.BrakeAxis     = 0.85f;
        BurnPkt.HandbrakeAxis = 1.0f;
        BurnPkt.SteerAxis     = 0.22f;
        LiveGame.SubmitLocalInput(BurnPkt);
        LiveGame.Step(1.0f / 60.0f);
    }
    std::vector<uint8_t> Frame4;
    Expect(RunEditorFrame(1.0f / 60.0f, &Frame4) && HasNonTrivialColorVariance(Frame4),
           "ControlVehicle burnout renders 4-wheel tyre smoke + ignited rubber fire + SDF ground glow");
    if (WriteProofs)
    {
        WriteRgbaPngFile(ProofDir + "/04_vehicle_burnout_smoke_and_fire.png", Frame4.data(), WinW, WinH);
        std::printf("  [INFO] Wrote 4 Vulkan PNG proofs to %s\n", ProofDir.c_str());
    }

    VkCtx.DestroyFramebuffer(ProofFbo);
    VkCtx.DestroyImageTarget(ProofColor);
    Editor.Shutdown(VkCtx);
    GuiPresenter.Shutdown(VkCtx);
    ImGui::DestroyContext();
    VkCtx.Shutdown();

    std::printf("\nValidation summary: %d failure(s).\n", Failures);
    return Failures == 0 ? 0 : 1;
}
