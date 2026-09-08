//============================================================================================================================================
//                                                      GAMEEXECUTION.CPP
//============================================================================================================================================
// 🧩 Project-Zero entry point — opens the Vulkan window, makes a glTF level resident, runs the ReSTIR render loop.
//
//    A headless A/B harness: there is no UI, no overlay and no sky. Every run is fully described by its command
//    line, so two runs with the same flags are directly comparable frame for frame. The flags exist to isolate
//    ReSTIR behaviour (reuse paths, denoiser, exposure) one variable at a time:
//
//        --scene <file.gltf|glb|shaderball|showroom|drop>   (default: Content/Scenes/CornellBox.gltf)
//        --scale <float>            uniform scene scale (default 1)
//        --width <px> --height <px> window size (default 1280x720)
//        --tier <auto|software|rayquery|pipeline>   traversal backend request (default auto)
//        --candidates <n> --extra <n>               ReSTIR budget (default 8, 2)
//        --exposure <float>         Manual-mode tone-map scalar (default 1.05)
//        --adaptive                 frame-metered exposure instead of the fixed Manual value
//        --no-gi --no-aa --no-temporal --no-spatial --uniform-pick --no-denoise --no-reprojection
//        --render-scale <float>     kernel resolution as a fraction of the window (default 1)
//        --frame-cap <fps>          pace the loop (default: uncapped)
//        --frames <n>               exit after n presented frames (default: run until the window closes)
//        --animate                  D3: drive instance transforms from a scripted path
//
//    showroom — the furnished level, exported once from ShowroomStructure then imported like any other
//    drop     — the physics level (D4): showroom + 12 rigid bodies (needs a Jolt-capable build)
//    default  CornellBox.gltf — regenerated from RayTracingSolver when missing, so the reference image is
//             unchanged; the CPU solver stays only as that generator.
//    Sponza   Content/Scenes/Sponza/Sponza.gltf (fetched by the build script, not committed).

#include "../../../Engine/DeviceExchange/SwapchainExchange.h"
#include "../../../Engine/DisplayPresentation/ReSTIRIntegrator.h"
#include "../../../Engine/DisplayPresentation/ShadingTableCodec.h"
#include "../../../Engine/DeviceExchange/DiagnosticMetrics.h"
#include "../../../Engine/ContentInterchange/ContentCodec.h"
#include "../../../Engine/ContentInterchange/SceneCodec.h"
#include "../../../Engine/ContentInterchange/MaterialDescriptor.h"
#include "../../../Engine/GeometricRaster/SceneStructure.h"
#include "../../../Engine/GeometricRaster/TraversalIndex.h"
#include "FlyThroughSolver.h"
#include "RayTracingSolver.h"
#include "../../../Engine/ContentInterchange/ShaderBallStructure.h"
#include "ShowroomStructure.h"
#include "InstanceMotionSequence.h"
#include "PhysicsInstanceSequence.h"

#include <algorithm>
#include <chrono>
#include <thread>
#include <string>
#include <cstdio>
#include <cstring>
#include <filesystem>
#include <iostream>

namespace {

void PrintUsage(const char* Program) noexcept
{
    std::cout << "Usage: " << Program << " [options]\n"
              << "  --scene <path|shaderball|showroom|drop>   level to render\n"
              << "  --scale <float>            uniform scene scale\n"
              << "  --width <px> --height <px> window size\n"
              << "  --tier <auto|software|rayquery|pipeline>\n"
              << "  --candidates <n> --extra <n>\n"
              << "  --exposure <float>         Manual-mode tone-map scalar\n"
              << "  --adaptive                 frame-metered exposure\n"
              << "  --no-gi --no-aa --no-temporal --no-spatial --uniform-pick --no-denoise --no-reprojection\n"
              << "  --render-scale <float>     kernel resolution fraction\n"
              << "  --frame-cap <fps>          pace the loop\n"
              << "  --frames <n>               exit after n presented frames\n"
              << "  --animate                  scripted instance motion (D3)\n";
}

} // namespace

int main(int argc, char** argv)
{
    // D4: how many rigid bodies the --scene drop level contains. Fixed so the exported glTF and the solver agree
    //    on instance ordinals without either having to inspect the other.
    constexpr uint32_t kDropBodyCount = 12u;

    std::string ScenePath  = "Projects/Project-Zero/Content/Scenes/CornellBox.gltf";
    float       SceneScale = 1.0f;
    uint32_t    WindowWidth = 1280u, WindowHeight = 720u;
    Frontier::RayTracingRequestCategory TierRequest = Frontier::RayTracingRequestCategory::Auto;
    uint32_t    Candidates = 8u, ExtraCandidates = 2u;
    float       Exposure = 1.05f;
    bool        AdaptiveExposure = false;
    bool        WantGi = true, WantAa = true, WantTemporal = true, WantSpatial = true;
    bool        WantAliasPick = true, WantDenoise = true, WantReprojection = true;
    float       RenderScale = 1.0f;
    float       FrameCapFps = 0.0f;   // 0 = uncapped
    uint32_t    FrameLimit = 0u;      // 0 = run until the window closes
    bool        AnimateInstances = false;   // D3: --animate drives instance transforms from a scripted path

    for (int I = 1; I < argc; ++I)
    {
        const char* Arg = argv[I];
        auto NeedValue = [&](const char* Flag) -> const char*
        {
            if (I + 1 >= argc) { std::cerr << "[CLI] " << Flag << " needs a value.\n"; return nullptr; }
            return argv[++I];
        };
        if      (std::strcmp(Arg, "--help") == 0)            { PrintUsage(argv[0]); return 0; }
        else if (std::strcmp(Arg, "--animate") == 0)         AnimateInstances = true;
        else if (std::strcmp(Arg, "--adaptive") == 0)        AdaptiveExposure = true;
        else if (std::strcmp(Arg, "--no-gi") == 0)           WantGi = false;
        else if (std::strcmp(Arg, "--no-aa") == 0)           WantAa = false;
        else if (std::strcmp(Arg, "--no-temporal") == 0)     WantTemporal = false;
        else if (std::strcmp(Arg, "--no-spatial") == 0)      WantSpatial = false;
        else if (std::strcmp(Arg, "--uniform-pick") == 0)    WantAliasPick = false;
        else if (std::strcmp(Arg, "--no-denoise") == 0)      WantDenoise = false;
        else if (std::strcmp(Arg, "--no-reprojection") == 0) WantReprojection = false;
        else if (std::strcmp(Arg, "--scene") == 0)        { if (const char* V = NeedValue(Arg)) ScenePath = V; }
        else if (std::strcmp(Arg, "--scale") == 0)        { if (const char* V = NeedValue(Arg)) SceneScale = static_cast<float>(std::atof(V)); }
        else if (std::strcmp(Arg, "--width") == 0)        { if (const char* V = NeedValue(Arg)) WindowWidth = static_cast<uint32_t>(std::atoi(V)); }
        else if (std::strcmp(Arg, "--height") == 0)       { if (const char* V = NeedValue(Arg)) WindowHeight = static_cast<uint32_t>(std::atoi(V)); }
        else if (std::strcmp(Arg, "--candidates") == 0)   { if (const char* V = NeedValue(Arg)) Candidates = static_cast<uint32_t>(std::atoi(V)); }
        else if (std::strcmp(Arg, "--extra") == 0)        { if (const char* V = NeedValue(Arg)) ExtraCandidates = static_cast<uint32_t>(std::atoi(V)); }
        else if (std::strcmp(Arg, "--exposure") == 0)     { if (const char* V = NeedValue(Arg)) Exposure = static_cast<float>(std::atof(V)); }
        else if (std::strcmp(Arg, "--render-scale") == 0) { if (const char* V = NeedValue(Arg)) RenderScale = static_cast<float>(std::atof(V)); }
        else if (std::strcmp(Arg, "--frame-cap") == 0)    { if (const char* V = NeedValue(Arg)) FrameCapFps = static_cast<float>(std::atof(V)); }
        else if (std::strcmp(Arg, "--frames") == 0)       { if (const char* V = NeedValue(Arg)) FrameLimit = static_cast<uint32_t>(std::atoi(V)); }
        else if (std::strcmp(Arg, "--tier") == 0)
        {
            if (const char* V = NeedValue(Arg))
            {
                using Frontier::RayTracingRequestCategory;
                if      (std::strcmp(V, "auto") == 0)     TierRequest = RayTracingRequestCategory::Auto;
                else if (std::strcmp(V, "software") == 0) TierRequest = RayTracingRequestCategory::Software;
                else if (std::strcmp(V, "rayquery") == 0) TierRequest = RayTracingRequestCategory::RayQuery;
                else if (std::strcmp(V, "pipeline") == 0) TierRequest = RayTracingRequestCategory::Pipeline;
                else std::cerr << "[CLI] Unknown --tier '" << V << "'; using auto.\n";
            }
        }
        else std::cerr << "[CLI] Unknown flag '" << Arg << "' ignored.\n";
    }
    WindowWidth  = std::max(1u, WindowWidth);
    WindowHeight = std::max(1u, WindowHeight);
    Candidates   = std::max(1u, Candidates);
    RenderScale  = std::clamp(RenderScale, 0.1f, 1.0f);
    if (ScenePath == "shaderball") ScenePath = "Projects/Project-Zero/Content/Scenes/ShaderBall.gltf";   // R4b material test level
    if (ScenePath == "showroom")   ScenePath = "Projects/Project-Zero/Content/Scenes/Showroom.gltf";     // furnished level
    bool DropScene = false;
    if (ScenePath == "drop") { ScenePath = "Projects/Project-Zero/Content/Scenes/ShowroomDrop.gltf"; DropScene = true; }   // D4 physics level

    //──────────────────────────────────────────────────────────────────────────
    // Telemetry sink
    //──────────────────────────────────────────────────────────────────────────
    Frontier::DiagnosticConfiguration DiagnosticConfig{};
    DiagnosticConfig.DestinationFolder          = "Diagnostics";
    DiagnosticConfig.OutputFileStem             = "ProjectZero_TelemetryReport";
    DiagnosticConfig.FileExtension              = ".md";
    DiagnosticConfig.TimestampPrefixEnabled     = true;
    DiagnosticConfig.ConsoleEchoEnabled         = true;    // 💡 mirror telemetry into the console so a failed bring-up is visible
    DiagnosticConfig.MarkdownTableFormatEnabled = true;

    Frontier::DiagnosticMetrics Logger(DiagnosticConfig);
    if (!Logger.InitializeSink())
        std::cerr << "[Project-Zero] Telemetry sink could not be opened; continuing with console output only.\n";
    Logger.RecordMessage(Frontier::DiagnosticSeverity::Information,
                         "Bootstrap", "Project-Zero headless ReSTIR renderer starting.");

    //──────────────────────────────────────────────────────────────────────────
    // Scene — glTF level made resident (R2). The Cornell box is exported once from the analytical solver so the
    //    reference image goes through the same import path as any other level.
    //──────────────────────────────────────────────────────────────────────────
    Frontier::ProjectZero::RayTracingSolver Scene;   // CPU reference geometry (Cornell exporter)
    {
        std::error_code FsError;
        const bool IsCornell = ScenePath.find("CornellBox.gltf") != std::string::npos;
        if (IsCornell && !std::filesystem::exists(ScenePath, FsError))
        {
            std::filesystem::create_directories(std::filesystem::path(ScenePath).parent_path(), FsError);
            std::string Error;
            if (Frontier::SceneCodec::Encode(ScenePath, Frontier::ReSTIRIntegrator::BuildTriangleIndex(Scene),
                                             Frontier::ReSTIRIntegrator::BuildMaterialDescriptors(Scene), &Error))
                std::cerr << "[Scene] Exported the Cornell box to " << ScenePath << "\n";
            else
                std::cerr << "[Scene] Cornell export failed: " << Error << "\n";
        }

        const bool IsShaderBall = ScenePath.find("ShaderBall.gltf") != std::string::npos;
        if (IsShaderBall && !std::filesystem::exists(ScenePath, FsError))
        {
            std::filesystem::create_directories(std::filesystem::path(ScenePath).parent_path(), FsError);
            std::string Error;
            Frontier::ShaderBallStructure ShaderBall; ShaderBall.Construct();
            if (ShaderBall.Export(ScenePath, &Error)) std::cerr << "[Scene] Exported the shader-ball level to " << ScenePath << "\n";
            else                                     std::cerr << "[Scene] Shader-ball export failed: " << Error << "\n";
        }
        // Furnished level. Same export-once-then-import discipline: the Cornell box stays the untouched
        //    bit-identity reference, and the showroom is a separate file the renderer only ever sees as glTF.
        const bool IsShowroom = ScenePath.find("Showroom.gltf") != std::string::npos || DropScene;
        if (IsShowroom && !std::filesystem::exists(ScenePath, FsError))
        {
            std::filesystem::create_directories(std::filesystem::path(ScenePath).parent_path(), FsError);
            std::string Error;
            Frontier::ProjectZero::ShowroomStructure Showroom; Showroom.Construct(DropScene ? kDropBodyCount : 0u);
            if (Showroom.Export(ScenePath, &Error)) std::cerr << "[Scene] Exported the showroom level to " << ScenePath << "\n";
            else                                    std::cerr << "[Scene] Showroom export failed: " << Error << "\n";
        }
    }

    Frontier::SceneStructure Level;
    Frontier::TextureIndex   Textures;
    {
        Frontier::SceneDecodeConfiguration Decode;
        Decode.UniformScale = SceneScale;
        // SlabLimit stays at its default (1): flatten every material to a single slab.
        std::string Error;
        if (!Frontier::ContentCodec::Decode(ScenePath, Level, &Textures, Decode, &Error))   // .gltf/.glb/.fbx/.obj by extension
        {
            Logger.RecordMessage(Frontier::DiagnosticSeverity::Fatal, "Scene", ("Cannot import " + ScenePath + ": " + Error).c_str());
            Logger.TerminateSink();
            std::cerr << "\nProject-Zero could not import the scene. Press Enter to close this console.\n";
            std::cin.get();
            return 1;
        }
        if (!Error.empty()) std::cerr << "[Scene] " << Error << "\n";
        Level.AssignName(std::filesystem::path(ScenePath).stem().string());
        const Frontier::Vector3 Lo = Level.QueryBoundsMinimum(), Hi = Level.QueryBoundsMaximum();
        char Line[256];
        std::snprintf(Line, sizeof(Line), "%s: %u triangles, %zu instances, %zu clusters, %zu materials, %zu luminaires, bounds [%.2f %.2f %.2f]..[%.2f %.2f %.2f] m",
                      Level.QueryName().c_str(), Level.QueryTriangleCount(), Level.QueryInstances().size(), Level.QueryClusters().size(),
                      (size_t)Level.QueryMaterials().QueryCount(), Level.QueryLuminaires().size(), Lo.x, Lo.y, Lo.z, Hi.x, Hi.y, Hi.z);
        Logger.RecordMessage(Frontier::DiagnosticSeverity::Information, "Scene", Line);
        {
            const Frontier::MaterialIndexMetrics& M = Level.QueryMaterials().QueryMetrics();
            std::vector<std::string> TextureReport;
            (void)Textures.Decode(0u, &TextureReport);   // 0 = no edge cap: keep full fidelity for the A/B
            for (const std::string& L : TextureReport) Logger.RecordMessage(Frontier::DiagnosticSeverity::Information, "Textures", L.c_str());
            std::snprintf(Line, sizeof(Line), "Materials: %u descriptors -> %u records, %u slabs (limit %u, %u folded), %zu placements, %zu cameras, %zu punctual lights",
                          M.DescriptorCount, M.DescriptorCount, M.SlabCount, M.SlabLimit, M.FoldedCount, Level.QueryPlacements().size(), Level.QueryCameras().size(), Level.QueryPunctualLuminaires().size());
            Logger.RecordMessage(Frontier::DiagnosticSeverity::Information, "Materials", Line);
        }
    }
    const uint32_t LuminaireCount = static_cast<uint32_t>(Level.QueryLuminaires().size());
    uint32_t AlphaMaskedMaterialCount = 0u;   // R4b: > 0 switches shadow rays to the alpha-mask-aware walk
    for (const Frontier::MaterialRecord& R : Level.QueryMaterials().QueryRecords())
        if (R.Flags & Frontier::MaterialFlagAlphaMask) ++AlphaMaskedMaterialCount;

    // R3: Tier A acceleration structure — tinybvh binned SAH → CWBVH over the flat world-space triangles.
    // D1: built through the bottom-level entry point. The whole level is currently ONE identity-transformed
    //     instance, so object space is world space. Per-instance transforms arrive in D2/D3.
    Frontier::TraversalIndex Traversal;
    {
        // SBVH; ~2× build time for ~10 % fewer steps. The drop level opts OUT: spatial splits cut triangles,
        //    which makes the tree unrefittable, and movable geometry is worth more here than the traversal gain.
        const bool HighQuality = !DropScene && Level.QueryTriangleCount() <= 2'000'000u;
        Traversal.BuildBottomLevel(Level.QueryFlatTriangles(), HighQuality);
        const Frontier::TraversalMetrics& M = Traversal.QueryMetrics();
        char Line[256];
        std::snprintf(Line, sizeof(Line), "CWBVH: %u triangles → %u nodes, %.1f KB nodes + %.1f KB leaves (%.1f B/tri), SAH %.2f, built in %.1f ms (%s)",
                      M.TriangleCount, M.NodeCount, M.NodeByteCount / 1024.0, M.LeafByteCount / 1024.0,
                      double(M.NodeByteCount + M.LeafByteCount) / std::max(1u, M.TriangleCount), M.SahCost, M.BuildMilliseconds,
                      M.HighQuality ? "spatial splits" : "binned SAH");
        Logger.RecordMessage(Frontier::DiagnosticSeverity::Information, "Traversal", Line);
    }

    //──────────────────────────────────────────────────────────────────────────
    // Camera — Unreal-style fly-through, right-handed +Z up
    //──────────────────────────────────────────────────────────────────────────
    Frontier::ProjectZero::FlyThroughConfiguration CameraConfig
    {
        2.5f,       // [m/s]    base flight speed
        3.0f,       // [-]      Shift boost multiplier
        0.00125f,   // [rad/px] mouse sensitivity (≈ 0.07°/px)
        0.5f,       // [m/s]    scroll speed increment
        12.0f       // [-]      acceleration damping
    };

    // Z-up: stand 1.95 m in front of the open face (Y < 0), eye height 1 m, looking along +Y into the box.
    Frontier::ProjectZero::FlyThroughSolver Camera(CameraConfig);
    // Pulled back and raised for the larger room (X ±2, Y 0-4, Z 0-3) so the whole box and the roof aperture are
    //    in frame from the default position.
    Camera.AssignSpatialLocation(Frontier::Vector3{ 0.0f, -3.30f, 1.55f });
    Camera.AssignOrientationEuler(0.0f, 0.0f, 0.0f);
    if (Level.QueryName() == "ShaderBall")
    {
        // Shader ball: 5 m back from the front row, 2.6 m up, pitched down ~22° so all four rows fit at 55° FoV.
        Camera.AssignSpatialLocation(Frontier::Vector3{ 0.0f, -6.2f, 2.6f });
        Camera.AssignOrientationEuler(-22.0f * 3.14159265f / 180.0f, 0.0f, 0.0f);
    }
    else if (Level.QueryName() == "Showroom" || Level.QueryName() == "ShowroomDrop")
    {
        // Showroom: stand just outside the open −Y face at eye height, looking along +Y. This frames the room
        //    centre with the chrome sphere in shot the moment the level opens.
        Camera.AssignSpatialLocation(Frontier::Vector3{ 0.0f, -1.70f, 1.45f });
        Camera.AssignOrientationEuler(0.0f, 0.0f, 0.0f);
    }
    else if (Level.QueryName() != "CornellBox")
    {
        // Other levels: start at the centre of the bounds at ~eye height, looking along +Y; flight speed scales with the level.
        const Frontier::Vector3 Lo = Level.QueryBoundsMinimum(), Hi = Level.QueryBoundsMaximum();
        Camera.AssignSpatialLocation(Frontier::Vector3{ (Lo.x + Hi.x) * 0.5f, (Lo.y + Hi.y) * 0.5f, Lo.z + std::min(1.7f, (Hi.z - Lo.z) * 0.5f) });
        CameraConfig.BaseFlightSpeed = std::max(2.5f, (Hi - Lo).Length() * 0.15f);
        Camera.AssignConfiguration(CameraConfig);
    }
    Camera.AssignFieldOfView(55.0f);
    Camera.AssignAspectRatio(static_cast<float>(WindowWidth) / static_cast<float>(WindowHeight));

    //──────────────────────────────────────────────────────────────────────────
    // ReSTIR integrator — owns dispatch parameters, accumulation index
    //──────────────────────────────────────────────────────────────────────────
    Frontier::ReSTIRIntegratorConfiguration IntegratorConfig
    {
        Candidates,      // [-]  candidates per pixel
        ExtraCandidates, // [-]  extra same-pixel candidates
        Exposure,        // [-]  ACES exposure
        0.015f           // [-]  ambient strength
    };
    IntegratorConfig.GlobalIllumination = WantGi;
    IntegratorConfig.AntiAliasing       = WantAa;
    IntegratorConfig.TemporalReuse      = WantTemporal;
    IntegratorConfig.SpatialReuse       = WantSpatial;
    IntegratorConfig.AliasPick          = WantAliasPick;
    IntegratorConfig.Denoise            = WantDenoise;
    IntegratorConfig.TemporalReprojection = WantReprojection;

    Frontier::ReSTIRIntegrator Integrator(IntegratorConfig);
    if (AdaptiveExposure)
    {
        Frontier::ExposureConfiguration Adapt = Integrator.Exposure().QueryConfiguration();
        Adapt.Mode = Frontier::ExposureModeCategory::Adaptive;
        Integrator.Exposure().AssignConfiguration(Adapt);
    }
    {
        char Line[256];
        std::snprintf(Line, sizeof(Line),
                      "Run: %u candidates, %u extra, exposure %s %.3f, GI %s, AA %s, temporal %s, spatial %s, pick %s, denoise %s, reprojection %s",
                      Candidates, ExtraCandidates, AdaptiveExposure ? "adaptive from" : "manual",
                      static_cast<double>(Exposure), WantGi ? "on" : "off", WantAa ? "on" : "off",
                      WantTemporal ? "on" : "off", WantSpatial ? "on" : "off",
                      WantAliasPick ? "alias" : "uniform", WantDenoise ? "on" : "off",
                      WantReprojection ? "on" : "off");
        Logger.RecordMessage(Frontier::DiagnosticSeverity::Information, "Run", Line);
    }

    //──────────────────────────────────────────────────────────────────────────
    // Swapchain exchange — GLFW window + Vulkan surface + compute pipeline
    //──────────────────────────────────────────────────────────────────────────
    Frontier::SwapchainConfiguration SurfaceConfig
    {
        WindowWidth,
        WindowHeight,
        "Project-Zero  |  ReSTIR GI  |  Frontier Engine",
        true        // validation layers — set true for debugging
    };

    Frontier::SwapchainExchange Surface(SurfaceConfig);
    Surface.AssignRayTracingRequest(TierRequest);

    if (!Surface.Bring())
    {
        Logger.RecordMessage(Frontier::DiagnosticSeverity::Fatal,
                             "Bootstrap", "SwapchainExchange bring-up failed - see the [SwapchainExchange] lines above for the failing stage.");
        Logger.TerminateSink();
        std::cerr << "\nProject-Zero could not open its window. Press Enter to close this console.\n";
        std::cin.get();
        return 1;
    }

    Logger.RecordMessage(Frontier::DiagnosticSeverity::Information,
                         "Bootstrap", "Window and Vulkan swapchain ready.");
    {
        char Line[128];
        std::snprintf(Line, sizeof(Line), "Ray-tracing: %s requested, %s resolved.",
                      Frontier::RayTracingCapabilitySet::RequestName(Surface.QueryRayTracingRequest()),
                      Frontier::RayTracingCapabilitySet::TierName(Surface.QueryRayTracingTier()));
        Logger.RecordMessage(Frontier::DiagnosticSeverity::Information, "Bootstrap", Line);
    }

    {
        const Frontier::ShadingTableSet Tables = Frontier::ShadingTableCodec::Bake();   // R4b: GGX energy + LTC sheen LUTs
        Surface.UploadShadingTables(Tables.Energy.data(), Tables.Sheen.data(), Frontier::ShadingTableSet::kResolution);
    }
    Surface.UploadScene(Level, Traversal, &Textures);

    //──────────────────────────────────────────────────────────────────────────
    // D3 — scripted instance motion (--animate), proving the transform path before physics
    //──────────────────────────────────────────────────────────────────────────
    // Off by default: with no flag the instance rows are never rewritten and the renderer behaves exactly as it
    //    did, which keeps the Cornell box a valid bit-identity reference. D4 replaces the scripted driver with
    //    RigidBodySolver poses and the upload below does not change.
    std::vector<Frontier::InstanceRecord> AnimatedInstances = Level.QueryInstances();

    // D5: a mutable copy of the flat world-space triangles. The acceleration structure is refitted over these, so
    //    the bodies' traced positions follow their drawn positions. Off unless the level actually has bodies, and
    //    disabled at run time if the refit ever refuses, so a failure degrades to static shadows rather than a crash.
    std::vector<Frontier::TriangleIndex> TracedFacets = Level.QueryFlatTriangles();
    bool  TraceMovingBodies      = false;
    float RefitMillisecondsPeak  = 0.0f;   // [ms]
    Frontier::ProjectZero::InstanceMotionSequence InstanceMotion;
    bool   InstanceMotionReady = false;
    double InstanceMotionElapsed = 0.0;   // [s]

    // D4 — real rigid bodies. Takes precedence over the scripted driver: --scene drop replaces the analytic path
    //    with Jolt poses through exactly the same RefreshInstances upload, which is why D3 was worth proving first.
    Frontier::RigidBodySolver                       BodySolver;
    Frontier::ProjectZero::PhysicsInstanceSequence  BodyBridge;
    bool PhysicsReady = false;

    if (DropScene && !AnimatedInstances.empty())
    {
        Frontier::RigidBodyConfiguration SolverConfiguration;
        SolverConfiguration.FixedStepSeconds = 1.0f / 60.0f;
        if (BodySolver.Bring(SolverConfiguration))
        {
            Frontier::ProjectZero::PhysicsInstanceConfiguration BridgeConfiguration;
            // The exporter appends drop bodies after the static scenery, so they occupy the trailing instances.
            BridgeConfiguration.DropCount         = kDropBodyCount;
            BridgeConfiguration.FirstDropInstance = static_cast<uint32_t>(AnimatedInstances.size()) - kDropBodyCount;
            BridgeConfiguration.BodyRadius        = Frontier::ProjectZero::ShowroomStructure::QueryDropRadius();
            PhysicsReady = BodyBridge.Construct(BodySolver, BridgeConfiguration);
            // Refit needs a binned-SAH tree; a spatial-split (HighQuality) build cuts triangles and cannot be
            //    refitted, so the drop level knowingly trades a little traversal speed for movable geometry.
            TraceMovingBodies = PhysicsReady && Traversal.IsRefittable();
        }
        Logger.RecordMessage(PhysicsReady ? Frontier::DiagnosticSeverity::Information
                                          : Frontier::DiagnosticSeverity::Warning,
                             "Physics",
                             PhysicsReady
                                 ? "Drop scene live: " + std::to_string(BodyBridge.QueryBodyCount()) +
                                   " rigid bodies from instance " +
                                   std::to_string(static_cast<uint32_t>(AnimatedInstances.size()) - kDropBodyCount) + "."
                                 : "Drop scene requested but the solver refused - the level renders statically.");

        if (PhysicsReady)
            Logger.RecordMessage(TraceMovingBodies ? Frontier::DiagnosticSeverity::Information
                                                   : Frontier::DiagnosticSeverity::Warning,
                                 "Physics",
                                 TraceMovingBodies
                                     ? "Traced geometry follows the bodies (acceleration structure refitted per frame)."
                                     : "Acceleration structure is not refittable - bodies will move but their shadows will not.");
    }

    if (AnimateInstances && !PhysicsReady && !AnimatedInstances.empty())
    {
        // Drive the trailing half of the instance list so the static front half proves, in the same frame, that
        //    untouched rows really are untouched.
        Frontier::ProjectZero::InstanceMotionConfiguration MotionConfiguration;
        MotionConfiguration.FirstInstance = static_cast<uint32_t>(AnimatedInstances.size()) / 2u;
        MotionConfiguration.InstanceCount = static_cast<uint32_t>(AnimatedInstances.size()) - MotionConfiguration.FirstInstance;
        InstanceMotion.Construct(AnimatedInstances, MotionConfiguration);
        InstanceMotionReady = InstanceMotion.QueryDrivenCount() > 0u;

        Logger.RecordMessage(InstanceMotionReady ? Frontier::DiagnosticSeverity::Information
                                                 : Frontier::DiagnosticSeverity::Warning,
                             "Instances",
                             InstanceMotionReady
                                 ? "Scripted instance motion on: " + std::to_string(InstanceMotion.QueryDrivenCount()) +
                                   " of " + std::to_string(AnimatedInstances.size()) + " instances animated."
                                 : "Scripted instance motion requested but no instances could be driven.");
    }

    Camera.AssignAspectRatio(
        static_cast<float>(Surface.QueryWidth()) /
        static_cast<float>(Surface.QueryHeight()));

    Logger.RecordMessage(Frontier::DiagnosticSeverity::Information,
                         "Bootstrap", "Entering render loop.");

    //──────────────────────────────────────────────────────────────────────────
    // Input exchange — filled each frame by GLFW callbacks
    //──────────────────────────────────────────────────────────────────────────
    Frontier::InputExchange Input;

    //──────────────────────────────────────────────────────────────────────────
    // Render loop
    //──────────────────────────────────────────────────────────────────────────
    using Clock    = std::chrono::high_resolution_clock;
    using Duration = std::chrono::duration<float>;

    const float FrameCapSeconds = FrameCapFps > 0.0f ? 1.0f / FrameCapFps : 0.0f;   // [s] 0 = unlimited
    uint32_t    PresentedFrames = 0u;

    auto PreviousTime = Clock::now();

    while (!Surface.CloseRequested() && (FrameLimit == 0u || PresentedFrames < FrameLimit))
    {
        const auto  NowTime = Clock::now();
        float       Δτ      = std::chrono::duration_cast<Duration>(NowTime - PreviousTime).count();
        PreviousTime        = NowTime;

        // Clamp Δτ to prevent spiral-of-death on window drag or breakpoints
        if (Δτ > 0.1f) Δτ = 0.1f;

        // ① Poll input — GLFW callbacks forward into Input
        Surface.PollInput(Input);

        // Escape closes the window. IsKeyPressed is level, not edge — holding it still just closes once.
        if (Input.IsKeyPressed(Frontier::VirtualKeyCategory::KeyEscape))
            Surface.RequestClose();

        // ② Advance camera kinematics
        Camera.AdvanceLocomotion(Input, Δτ);
        Camera.AssignAspectRatio(
            static_cast<float>(Surface.QueryWidth()) /
            static_cast<float>(Surface.QueryHeight()));

        // ③ Build dispatch configuration from live camera + integrator state (camera motion restarts accumulation).
        //    Render scale: the kernel runs on a sub-rectangle of the storage image and the blit stretches it.
        const uint32_t RenderWidth  = std::max(1u, static_cast<uint32_t>(static_cast<float>(Surface.QueryWidth())  * RenderScale + 0.5f));
        const uint32_t RenderHeight = std::max(1u, static_cast<uint32_t>(static_cast<float>(Surface.QueryHeight()) * RenderScale + 0.5f));

        // A6b — adaptive exposure. The measurement is one or two frames stale because it is read from the cycle
        //    slot the GPU has already finished with; against time constants of half a second and up that is
        //    invisible, and it is what keeps the read from stalling the CPU on the GPU. In Manual mode (the
        //    default) Advance holds the fixed value and the measurement below is ignored.
        {
            const float Measured = Surface.QueryAverageLogLuminance();
            if (Measured > -1.0e8f) Integrator.Exposure().ObserveLuminance(Measured);
            Integrator.Exposure().Advance(Δτ);
        }

        Integrator.ObserveCamera(Camera, RenderWidth, RenderHeight);

        const Frontier::DispatchConfiguration Dispatch = Integrator.BuildDispatch(
            Camera,
            RenderWidth,
            RenderHeight,
            AlphaMaskedMaterialCount,
            LuminaireCount);

        // ④ R2 front end: same camera, reverse-Z infinite projection; AA jitter is a per-frame Halton(2,3) offset shared
        //    by the raster and the resolve (pixel centre when AA is off).
        {
            Frontier::VisibilityFrameConfiguration Frame{};
            Frame.Camera.Origin             = Camera.QuerySpatialLocation();
            Frame.Camera.Forward            = Camera.QueryForwardVector();
            Frame.Camera.Right              = Camera.QueryRightVector();
            Frame.Camera.Up                 = Camera.QueryUpwardVector();
            Frame.Camera.TanHalfFieldOfView = Dispatch.FieldOfViewTanHalf;
            Frame.Camera.AspectRatio        = Camera.QueryAspectRatio();
            Frame.Camera.NearDistance       = Camera.QueryNearPlaneDistance();
            Frame.RenderWidth               = RenderWidth;
            Frame.RenderHeight              = RenderHeight;
            const auto Halton = [](uint32_t Index, uint32_t Base) { float F = 1.0f, R = 0.0f; for (Index += 1u; Index > 0u; Index /= Base) { F /= static_cast<float>(Base); R += F * static_cast<float>(Index % Base); } return R; };
            const bool Jittered = Integrator.QueryConfiguration().AntiAliasing;
            Frame.JitterX          = Jittered ? Halton(Integrator.QueryAccumulationIndex(), 2u) : 0.5f;
            Frame.JitterY          = Jittered ? Halton(Integrator.QueryAccumulationIndex(), 3u) : 0.5f;
            Frame.FrameIndex       = Integrator.QueryAccumulationIndex();
            Frame.DebugView        = Frontier::DebugViewCategory::Off;
            Frame.OcclusionCulling = true;
            Frame.ConeCulling      = false;   // the kernel shades both faces; cone culling would remove back-facing walls seen from outside
            Surface.AssignVisibilityFrame(Frame);
        }

        // ⑤ D3 — advance instance transforms and refresh them in place. No reallocation and no device stall, so
        //     unlike UploadScene this is safe every frame; the VkBuffer handle is unchanged so descriptors stand.
        if (PhysicsReady)
        {
            BodyBridge.AdvancePhysics(BodySolver, AnimatedInstances, Δτ);
            if (!Surface.RefreshInstances(AnimatedInstances.data(), static_cast<uint32_t>(AnimatedInstances.size())))
            {
                PhysicsReady = false;
                Logger.RecordMessage(Frontier::DiagnosticSeverity::Warning, "Physics",
                                     "RefreshInstances refused the row set - physics disabled.");
            }

            // D5 — move the traced geometry too. Without this the bodies are DRAWN in their new places while
            //     their shadows and reflections stay where the structure was built, which reads as the bodies
            //     floating free of their own shadows.
            if (TraceMovingBodies && PhysicsReady)
            {
                BodyBridge.RefreshBodyFacets(TracedFacets, AnimatedInstances);
                if (Traversal.RefitBottomLevel(TracedFacets) && Surface.RefreshTraversal(Traversal, TracedFacets))
                {
                    RefitMillisecondsPeak = std::max(RefitMillisecondsPeak, Traversal.QueryRefitMilliseconds());
                }
                else
                {
                    TraceMovingBodies = false;
                    Logger.RecordMessage(Frontier::DiagnosticSeverity::Warning, "Physics",
                                         "Acceleration-structure refit refused - shadows will not follow the bodies.");
                }
            }
        }
        else if (InstanceMotionReady)
        {
            InstanceMotionElapsed += static_cast<double>(Δτ);
            InstanceMotion.AdvanceMotion(AnimatedInstances, InstanceMotionElapsed);
            if (!Surface.RefreshInstances(AnimatedInstances.data(), static_cast<uint32_t>(AnimatedInstances.size())))
            {
                InstanceMotionReady = false;   // count no longer matches the resident scene — stop rather than tear
                Logger.RecordMessage(Frontier::DiagnosticSeverity::Warning, "Instances",
                                     "RefreshInstances refused the row set - scripted motion disabled.");
            }
        }

        // ⑥ Cull → raster → HiZ → resolve → kernel, blit to swapchain, present
        Surface.RecordAndPresent(Dispatch);

        Integrator.IncrementAccumulationIndex();
        ++PresentedFrames;

        // --frame-cap: sleep out the remainder of the frame budget (coarse sleep, then spin the last ~1 ms so
        //    the cap holds on Windows' 1 ms timer granularity). Unlimited = 0 → no pacing.
        if (FrameCapSeconds > 0.0f)
        {
            const auto Deadline = NowTime + std::chrono::duration_cast<Clock::duration>(Duration(FrameCapSeconds));
            const auto Coarse   = Deadline - std::chrono::milliseconds(1);
            if (Clock::now() < Coarse) std::this_thread::sleep_until(Coarse);
            while (Clock::now() < Deadline) { }
        }

        // Keep the on-disk telemetry current even if the process is killed mid-run.
        if ((Integrator.QueryAccumulationIndex() & 63u) == 0u) Logger.FlushSink();
    }

    //──────────────────────────────────────────────────────────────────────────
    // Shutdown
    //──────────────────────────────────────────────────────────────────────────
    Surface.Retire();

    {
        char Line[96];
        std::snprintf(Line, sizeof(Line), "Render loop exited cleanly after %u presented frames.", PresentedFrames);
        Logger.RecordMessage(Frontier::DiagnosticSeverity::Information, "Shutdown", Line);
    }

    if (RefitMillisecondsPeak > 0.0f)
    {
        char RefitLine[160];
        std::snprintf(RefitLine, sizeof(RefitLine),
                      "Acceleration-structure refit peaked at %.2f ms/frame (%.0f%% of a 16.7 ms budget).",
                      static_cast<double>(RefitMillisecondsPeak),
                      100.0 * static_cast<double>(RefitMillisecondsPeak) / 16.7);
        Logger.RecordMessage(RefitMillisecondsPeak > 8.0f ? Frontier::DiagnosticSeverity::Warning
                                                          : Frontier::DiagnosticSeverity::Information,
                             "Physics", RefitLine);
    }
    Logger.TerminateSink();

    return 0;
}
