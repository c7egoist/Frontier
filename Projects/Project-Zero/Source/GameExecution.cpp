//============================================================================================================================================
//                                                      GAMEEXECUTION.CPP
//============================================================================================================================================
// 🧩 Project-Zero entry point — opens the Vulkan window, makes a glTF level resident, runs the ReSTIR render loop.
//
//    Scene selection (R2): `Project-Zero.exe [--scene <file.gltf|glb|shaderball|showroom>] [--scale <float>]`
//        showroom — P0 spatial-interface level, exported once from ShowroomStructure then imported like any other
//        default  Projects/Project-Zero/Content/Scenes/CornellBox.gltf — regenerated from RayTracingSolver when missing,
//                 so the reference image is unchanged; the CPU solver stays only as that generator.
//        Sponza   Projects/Project-Zero/Content/Scenes/Sponza/Sponza.gltf (fetched by the build script, not committed).

#include "../../../Engine/DeviceExchange/SwapchainExchange.h"
#include "../../../Engine/DisplayPresentation/ReSTIRIntegrator.h"
#include "../../../Engine/DisplayPresentation/ShadingTableCodec.h"
#include "../../../Engine/DisplayPresentation/RenderScheduler.h"
#include "../../../Engine/DeviceExchange/DiagnosticMetrics.h"
#include "../../../Engine/DisplayPresentation/InterfaceBrowserSequence.h"
#include "../../../Engine/DisplayPresentation/ControlCentreHost.h"
#include "../../../Engine/DisplayPresentation/PixelSpace.h"
#include "../../../Engine/DisplayPresentation/FidelityClassifier.h"
#include "../../../Engine/DisplayPresentation/NotificationQueue.h"
#include "../../../Engine/DisplayPresentation/TelemetryMetrics.h"
#include "../../../Engine/DisplayPresentation/TypefaceRegistry.h"
#include "../../../Engine/DisplayPresentation/ConfigurationRegistry.h"
#include "../../../Engine/DisplayPresentation/DiagnosticInspector.h"
#include "../../../Engine/ContentInterchange/ContentCodec.h"
#include "../../../Engine/GeometricRaster/SceneStructure.h"
#include "../../../Engine/GeometricRaster/TraversalIndex.h"
#include "FlyThroughSolver.h"
#include "RayTracingSolver.h"
#include "../../../Engine/ContentInterchange/ShaderBallStructure.h"
#include "ShowroomStructure.h"
#include "../../../Engine/DeviceExchange/InterfaceExchange.h"
#include "../../../Engine/SpatialInterface/InterfaceSequence.h"
#include "../../../Engine/SpatialInterface/InterfacePointerProjection.h"
#include "../../../Engine/GeometricRaster/ClipProjection.h"
#include "InterfaceTrialSequence.h"
#include "InstanceMotionSequence.h"
#include "PhysicsInstanceSequence.h"
#include "InterfaceAudioSequence.h"
#include "../../../Engine/SpatialInterface/InterfaceScreenSequence.h"
#include "../../../Engine/SpatialInterface/InterfaceTextProjection.h"
#include "../../../Engine/SpatialInterface/InterfaceVectorCodec.h"
#include "../../../Engine/SpatialInterface/InterfaceLightProjection.h"

#include <algorithm>
#include <chrono>
#include <thread>
#include <string>
#include <cstdio>
#include <cstring>
#include <filesystem>
#include <iostream>

int main(int argc, char** argv)
{
    // D4: how many rigid bodies the --scene drop level contains. Fixed so the exported glTF and the solver agree
    //    on instance ordinals without either having to inspect the other.
    constexpr uint32_t kDropBodyCount = 12u;

    std::string ScenePath  = "Projects/Project-Zero/Content/Scenes/CornellBox.gltf";
    float       SceneScale = 1.0f;
    bool        AnimateInstances = false;   // D3: --animate drives instance transforms from a scripted path
    bool        SilentAudio      = false;   // --silent: open the null audio driver (no sound card, or CI)
    for (int I = 1; I < argc; ++I)
    {
        if (std::strcmp(argv[I], "--animate") == 0) { AnimateInstances = true; continue; }
        if (std::strcmp(argv[I], "--silent")  == 0) { SilentAudio      = true; continue; }   // null audio driver
        if (I + 1 >= argc) break;
        if (std::strcmp(argv[I], "--scene") == 0) ScenePath  = argv[++I];
        if (std::strcmp(argv[I], "--scale") == 0) SceneScale = static_cast<float>(std::atof(argv[++I]));
    }
    if (ScenePath == "shaderball") ScenePath = "Projects/Project-Zero/Content/Scenes/ShaderBall.gltf";   // R4b material test level
    if (ScenePath == "showroom")   ScenePath = "Projects/Project-Zero/Content/Scenes/Showroom.gltf";     // P0 spatial-interface level
    // A8: the open scene. The sky work can only be judged where the sky is actually visible.
    if (ScenePath == "outdoor")    ScenePath = "Projects/Project-Zero/Content/Scenes/Outdoor.gltf";
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
                         "Bootstrap", "Project-Zero windowed ReSTIR renderer starting.");

    //──────────────────────────────────────────────────────────────────────────
    // Scene — glTF level made resident (R2). The Cornell box is exported once from the analytical solver so the
    //    reference image goes through the same import path as any other level.
    //──────────────────────────────────────────────────────────────────────────
    Frontier::ProjectZero::RayTracingSolver Scene;   // CPU reference geometry (Cornell exporter + ImGui scene section)
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
        const bool IsOutdoor = ScenePath.find("Outdoor.gltf") != std::string::npos;
        if (IsOutdoor && !std::filesystem::exists(ScenePath, FsError))
        {
            std::filesystem::create_directories(std::filesystem::path(ScenePath).parent_path(), FsError);
            Frontier::ProjectZero::RayTracingSolver Open;
            Open.ConstructOutdoorScene();
            std::string Error;
            // ⚠️ The encoder names the mesh "CornellBox" by default, and the camera branch below keys off that
            //    name — without this the outdoor scene would load with the Cornell camera, indoors-facing.
            Frontier::SceneEncodeConfiguration OutdoorNaming{};
            OutdoorNaming.Name = "Outdoor";
            if (Frontier::SceneCodec::Encode(ScenePath, Frontier::ReSTIRIntegrator::BuildTriangleIndex(Open),
                                             Frontier::ReSTIRIntegrator::BuildMaterialDescriptors(Open), &Error,
                                             OutdoorNaming))
                std::cerr << "[Scene] Exported the outdoor scene to " << ScenePath << "\n";
            else
                std::cerr << "[Scene] Outdoor export failed: " << Error << "\n";
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
        // P0 spatial-interface level. Same export-once-then-import discipline: the Cornell box stays the untouched
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

    Frontier::ConfigurationRegistry Configuration;
    if (!Configuration.Load("Projects/Project-Zero/Content/Slate.config.toml"))
        std::cerr << "[Configuration] " << Configuration.QueryPath() << ": " << Configuration.QueryLastError() << " - using defaults\n";

    Frontier::SceneStructure Level;
    Frontier::TextureIndex   Textures;
    uint32_t MaxTextureLevels = 1u;   // R6 row 3: deepest mip chain resident (F3 scene-census row; computed once below)
    {
        Frontier::SceneDecodeConfiguration Decode;
        Decode.UniformScale = SceneScale;
        Decode.SlabLimit    = Configuration.Query().Backend.SlabLimit;
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
            (void)Textures.Decode(Configuration.Query().Backend.TextureEdgeLimit, &TextureReport);
            for (const Frontier::TextureDescriptor& T : Textures.QueryTextures())
                MaxTextureLevels = std::max(MaxTextureLevels, T.LevelCount);   // R6 row 3: LOD census for the F3 popup
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

    //──────────────────────────────────────────────────────────────────────────
    // Interface light contribution — the panel as an emitter in the room
    //──────────────────────────────────────────────────────────────────────────
    // Where the panel hangs, resolved here because the proxy must be registered before the acceleration structure
    //    is built — well before the interface itself is brought up further down.
    const bool ShowroomLevelForLight = Level.QueryName() == "Showroom" || Level.QueryName() == "ShowroomDrop";
    Frontier::PlanePlacement PanelPlacementForLight;
    if (ShowroomLevelForLight)
    {
        const Frontier::Vector3 LightAnchor = Frontier::ProjectZero::ShowroomStructure::QueryPanelOrigin();
        PanelPlacementForLight.Origin    = Frontier::PlaneOrigin{ LightAnchor.x, LightAnchor.y, LightAnchor.z };
        PanelPlacementForLight.RotationX = 1.57079633f + Frontier::ProjectZero::ShowroomStructure::QueryPanelTilt();
        PanelPlacementForLight.Scale     = 2.2f;
    }

    // Registered BEFORE the acceleration structure is built, and the scene re-finalised, because Finalise is what
    //    flattens triangles and builds the luminaire table. A proxy added after it would be geometry the light
    //    sampler never sees: drawn, but lighting nothing.
    //
    //    The radiance is measured once here from the panel's rest composition rather than per frame. A per-frame
    //    update would mean rebuilding the acceleration structure every time a lamp changed brightness, which is
    //    the 28 ms rebuild D6 measured — far too expensive for a second-order lighting effect. The panel's average
    //    colour barely moves during the trial loop, so a static proxy is the honest trade.
    Frontier::InterfaceFidelityTier PanelTier = Frontier::InterfaceFidelityTier::Low;
    if (ShowroomLevelForLight)
    {
        Frontier::InterfaceStructure RestFigures;
        Frontier::MotionIntegrator   RestMotion;
        Frontier::ProjectZero::InterfaceTrialSequence RestTrial;
        RestTrial.AssignPanelPlacement(PanelPlacementForLight);
        RestTrial.Construct(RestFigures, RestMotion);
        RestTrial.AdvanceTrial(RestFigures, RestMotion, 1.5, true);   // mid-loop: buttons lit, bar part filled

        Frontier::InterfaceSequence RestComposition;
        Frontier::InterfaceViewConfiguration RestView;
        RestView.EyeY = -1.70f; RestView.EyeZ = 1.45f; RestView.ForwardY = 1.0f;
        RestComposition.AssignView(RestView);
        RestComposition.Advance(RestFigures, 1.5);

        // Panel face in world space. Scale 2.2 and the trial's authored half extents give the half-axes; the
        //    showroom tilt leans the face back, so the up axis is not simply world +Z.
        const float HalfWidth  = 0.115f * 2.2f;   // [m]
        const float HalfHeight = 0.072f * 2.2f;   // [m]
        const float Tilt = Frontier::ProjectZero::ShowroomStructure::QueryPanelTilt();
        const Frontier::Vector3 Anchor = Frontier::ProjectZero::ShowroomStructure::QueryPanelOrigin();

        Frontier::PanelProxyRequest Proxy;
        Proxy.Tier    = PanelTier;
        Proxy.CentreX = Anchor.x; Proxy.CentreY = Anchor.y; Proxy.CentreZ = Anchor.z;
        Proxy.RightX  = HalfWidth; Proxy.RightY = 0.0f; Proxy.RightZ = 0.0f;
        // Local +Y after the stand-up rotation and tilt: mostly world +Z, leaning toward −Y.
        Proxy.UpX = 0.0f;
        Proxy.UpY = -HalfHeight * std::sin(Tilt);
        Proxy.UpZ =  HalfHeight * std::cos(Tilt);
        // A display that reads correctly as an overlay is far too dim as an emitter measured against a 32 nit
        //    ceiling panel; this brings it into the same range as the room's own luminaires.
        Proxy.Gain = 26.0f;

        const Frontier::PanelRadiance Radiance =
            Frontier::InterfaceLightProjection::MeasureRadiance(RestFigures, RestComposition,
                                                                4.0f * HalfWidth * HalfHeight);
        const uint32_t ProxyInstance =
            Frontier::InterfaceLightProjection::ComposeProxy(Level, Proxy, Radiance);

        if (ProxyInstance != 0xFFFFFFFFu)
        {
            Level.Finalise(64u, nullptr);   // rebuilds the flat triangles and the luminaire table with the proxy in
            char Line[224];
            std::snprintf(Line, sizeof(Line),
                          "Panel light %s: rgb (%.3f %.3f %.3f) from %u figures, %.0f%% coverage, %zu luminaires now.",
                          Frontier::InterfaceFidelityTierName(PanelTier),
                          Radiance.Red, Radiance.Green, Radiance.Blue, Radiance.Contributors,
                          Radiance.Coverage() * 100.0, Level.QueryLuminaires().size());
            Logger.RecordMessage(Frontier::DiagnosticSeverity::Information, "Interface", Line);
        }
        else
        {
            Logger.RecordMessage(Frontier::DiagnosticSeverity::Information, "Interface",
                                 std::string("Panel light ") + Frontier::InterfaceFidelityTierName(PanelTier) +
                                 ": no proxy registered (tier off, unavailable, or the panel emits nothing).");
        }
    }

    // R3: Tier A acceleration structure — tinybvh binned SAH → CWBVH over the flat world-space triangles.
    // D1: built through the bottom-level entry point. The whole level is currently ONE identity-transformed
    //     instance, so object space is world space and this is bit-for-bit what Build() produced before
    //     (Scratchpad/CheckTraversalIdentity.sh is the gate). Per-instance transforms arrive in D2/D3.
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
    else if (Level.QueryName() == "Outdoor")
    {
        // Standing on open ground at eye height, looking north along +Y at the casters, pitched up 8° so the
        //    horizon sits low in frame and most of the view is sky — which is the whole reason this scene exists.
        Camera.AssignSpatialLocation(Frontier::Vector3{ 0.0f, -6.0f, 1.70f });
        Camera.AssignOrientationEuler(8.0f * 3.14159265f / 180.0f, 0.0f, 0.0f);
    }
    else if (Level.QueryName() == "Showroom" || Level.QueryName() == "ShowroomDrop")
    {
        // Showroom: stand just outside the open −Y face at eye height, looking along +Y. This frames the panel
        //    anchor (0, 1.55, 1.32) dead centre with the chrome sphere directly beneath it, so the panel and its
        //    reflection are both in shot the moment the level opens.
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
    Camera.AssignAspectRatio(1280.0f / 720.0f);

    //──────────────────────────────────────────────────────────────────────────
    // ReSTIR integrator — owns dispatch parameters, accumulation index
    //──────────────────────────────────────────────────────────────────────────
    Frontier::ReSTIRIntegratorConfiguration IntegratorConfig
    {
        8u,         // [-]  candidates per pixel
        2u,         // [-]  extra same-pixel candidates
        1.05f,      // [-]  ACES exposure
        0.015f      // [-]  ambient strength
    };

    Frontier::ReSTIRIntegrator Integrator(IntegratorConfig);

    //──────────────────────────────────────────────────────────────────────────
    // Swapchain exchange — GLFW window + Vulkan surface + compute pipeline
    //──────────────────────────────────────────────────────────────────────────
    Frontier::SwapchainConfiguration SurfaceConfig
    {
        1280u,
        720u,
        "Project-Zero  |  ReSTIR GI  |  Frontier Engine",
        true        // validation layers — set true for debugging
    };

    // Slate.config.toml is read before the device comes up: [render] ray_tracing_tier decides which traversal backend
    //    the swapchain resolves (missing file = defaults = Auto).

    Frontier::SwapchainExchange Surface(SurfaceConfig);
    Surface.AssignRayTracingRequest(static_cast<Frontier::RayTracingRequestCategory>(Configuration.Query().Backend.RayTracingTier));

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

    //──────────────────────────────────────────────────────────────────────────
    // ImGui panel — apply theme once after context exists
    //──────────────────────────────────────────────────────────────────────────
    Frontier::RenderScheduler Panel;

    //──────────────────────────────────────────────────────────────────────────
    // World Browser — replaces the ImGui scene / render inspector. The notch Control Centre is a different
    //    surface and is untouched: this is the right-hand panel only.
    //    The engine ships a generic tree; everything below is Project-Zero saying what its rows MEAN.
    //──────────────────────────────────────────────────────────────────────────
    Frontier::InterfaceBrowserSequence Browser;
    enum : uint32_t { RowFolder = 0u, RowMesh = 1u, RowLight = 2u, RowCamera = 3u, RowSky = 4u, RowSun = 5u, RowMoon = 6u };
    {
        using Frontier::OutlinerTypeRecord;
        Browser.AssignTitle("World Browser", "Cornell Box");
        Frontier::InterfaceOutlinerSequence& Tree = Browser.Outliner();
        Tree.RegisterType(RowFolder, OutlinerTypeRecord{ "Folder", Frontier::ControlCentreIconCategory::FolderClosed,     { 0.788f, 0.635f, 0.294f, 1.0f }, true  });
        Tree.RegisterType(RowMesh,   OutlinerTypeRecord{ "Mesh",   Frontier::ControlCentreIconCategory::CubeObject,       { 0.604f, 0.627f, 0.651f, 1.0f }, false });
        Tree.RegisterType(RowLight,  OutlinerTypeRecord{ "Light",  Frontier::ControlCentreIconCategory::SunIllumination,  { 0.961f, 0.827f, 0.294f, 1.0f }, false });
        Tree.RegisterType(RowCamera, OutlinerTypeRecord{ "Camera", Frontier::ControlCentreIconCategory::CameraBody,       { 0.412f, 0.765f, 1.0f,   1.0f }, false });
        Tree.RegisterType(RowSky,    OutlinerTypeRecord{ "Sky",    Frontier::ControlCentreIconCategory::WirelessSignal,   { 0.561f, 0.827f, 1.0f,   1.0f }, false });
        Tree.RegisterType(RowSun,    OutlinerTypeRecord{ "Sun",    Frontier::ControlCentreIconCategory::SunIllumination,  { 1.0f,   0.694f, 0.294f, 1.0f }, false });
        Tree.RegisterType(RowMoon,   OutlinerTypeRecord{ "Moon",   Frontier::ControlCentreIconCategory::MoonDisturbance,  { 0.722f, 0.769f, 0.839f, 1.0f }, false });
    }
    // Payload 0 means "no scene object": folders and the not-yet-implemented sky rows.
    uint32_t BrowserCameraRow   = Frontier::kOutlinerNoRow;
    uint32_t BrowserApertureRow = Frontier::kOutlinerNoRow;

    // The browser writes through float* / bool*, so live state is mirrored into these each frame and copied back
    //    after. A mirror rather than a direct pointer because the sources are different shapes: the integrator
    //    keeps uint32 counts, the camera keeps radians, and a slider only speaks float.
    float BrowserCameraPosition[3] = { 0.0f, 0.0f, 0.0f };
    float BrowserCameraSpeed = 2.5f, BrowserCameraFov = 55.0f;
    float BrowserCandidates = 4.0f, BrowserExtra = 2.0f, BrowserExposure = 1.05f;
    float BrowserLuminaire = 32.0f;
    bool  BrowserTemporal = true, BrowserSpatial = true, BrowserAlias = true, BrowserDenoise = true;
    bool  BrowserPointerDown = false, BrowserPointerWasDown = false, BrowserCoversPointer = false;
    // A3 sky mirrors. Sliders speak float, so the quality enum rides as a float and is rounded on copy-back.
    float BrowserSkyQuality = 2.0f, BrowserSunLux = 120000.0f, BrowserAltitude = 2.0f;
    float BrowserTimeOfDay  = 12.0f, BrowserClockRate = 0.0f, BrowserLatitude = 45.0f;
    bool  BrowserSkyLighting = true;
    bool  BrowserAutoExposure = true;
    bool  BrowserNightSky = true;
    float BrowserStarBrightness = 0.4f;
    // A7b turbidity: the day's mean aerosol load and how far it swings between dawn and dusk.
    float BrowserTurbidity = 1.0f, BrowserTurbiditySwing = 0.35f;
    char  BrowserTurbidityText[48] = "-";
    char  BrowserExposureText[48] = "-";
    char  BrowserSunElevationText[32]  = "-";
    char  BrowserSunAzimuthText[32]    = "-";
    char  BrowserMoonPhaseText[32]     = "-";
    char  BrowserMoonElevationText[32] = "-";
    // A7c moon. Scale is the one settable moon parameter; the rest are read back from the clock so they can
    //    never disagree with it.
    float BrowserMoonScale = 1.0f;
    char  BrowserMoonAzimuthText[32]   = "-";
    char  BrowserMoonSizeText[48]      = "-";
    char  BrowserMoonLuminanceText[48] = "-";
    char  BrowserApertureText[64]      = "-";
    // Written inside the ImGui frame, read on the NEXT frame's camera gate: the gate runs before the frame that
    //    would answer it, so a same-frame read is impossible. One frame of lag on "is the cursor over the panel"
    //    is invisible, whereas flying the camera because the answer was not yet available is not.
    bool  BrowserWindowHovered = false;
    {
        Frontier::InterfaceOutlinerSequence& Tree = Browser.Outliner();

        const uint32_t Environment = Tree.Construct("Environment", RowFolder, Frontier::kOutlinerNoParent, 0u);
        Tree.Construct("Sky Atmosphere", RowSky,  Environment, 0u);
        Tree.Construct("Sun",            RowSun,  Environment, 0u);
        Tree.Construct("Moon",           RowMoon, Environment, 0u);

        // Geometry rows carry the MATERIAL ordinal as their payload: the Cornell box is one mesh split by material,
        //    so a material is the finest thing the browser can currently address. When the scene grows real
        //    per-object placements this becomes an instance ordinal and nothing else here changes.
        const uint32_t Geometry = Tree.Construct("Geometry", RowFolder, Frontier::kOutlinerNoParent, 0u);
        struct GeometryRow { const char* Name; uint32_t Material; bool Locked; };
        static const GeometryRow Parts[] = {
            { "Floor",              0u, true  }, { "Ceiling",            0u, true  },
            { "Back Wall",          0u, true  }, { "Left Wall (Red)",    1u, true  },
            { "Right Wall (Green)", 2u, true  }, { "Tall Box",           4u, false },
            { "Short Box",          5u, false },
            // The three parametric shapes. They have been in the scene since the aperture was cut, but not in
            //    this list — so they rendered and could not be selected, which reads as the browser being out
            //    of date with the room rather than as a missing row.
            { "Sphere",             6u, false },
            { "Cone",               7u, false },
            { "Torus",              8u, false },
        };
        for (const GeometryRow& Part : Parts)
        {
            const uint32_t Row = Tree.Construct(Part.Name, RowMesh, Geometry, Part.Material);
            Tree.Row(Row).Locked  = Part.Locked;      // the shell is fixed; only the boxes are movable
            Tree.Row(Row).Dynamic = !Part.Locked;
        }

        const uint32_t Lighting = Tree.Construct("Lighting", RowFolder, Frontier::kOutlinerNoParent, 0u);
        Tree.Construct("Ceiling Luminaire", RowLight, Lighting, 3u);
        // The aperture is an absence of geometry, so it has no material to address and is listed as a light:
        //    that is what it is in this room, and it is the only row that explains where the daylight enters.
        BrowserApertureRow = Tree.Construct("Roof Oculus", RowLight, Lighting, 0u);
        Tree.Row(BrowserApertureRow).Locked = true;

        const uint32_t Cameras = Tree.Construct("Cameras", RowFolder, Frontier::kOutlinerNoParent, 0u);
        BrowserCameraRow = Tree.Construct("Main Camera", RowCamera, Cameras, 0u);
        Tree.AssignSelection(BrowserCameraRow);
    }

    // The browser asks for property rows each frame; this is where Project-Zero says what a row MEANS. Values are
    //    written through raw pointers into live state, so an edit lands immediately with no copy-back step.
    Browser.AssignPropertyBuilder(
        [&](uint32_t RowOrdinal, std::vector<Frontier::PropertyRowRecord>& Rows)
        {
            using Frontier::PropertyRowRecord;
            using Kind = Frontier::PropertyKindCategory;

            const Frontier::InterfaceOutlinerSequence& Tree = Browser.Outliner();
            if (RowOrdinal >= Tree.QueryRowCount()) return;
            const Frontier::OutlinerRowRecord& Row = Tree.QueryRow(RowOrdinal);

            PropertyRowRecord R{};
            const auto Heading = [&](const char* Label) { R = {}; R.Kind = Kind::Heading; R.Label = Label; Rows.push_back(R); };
            const auto Slider  = [&](const char* Label, float* Value, float Lo, float Hi, const char* Unit, uint32_t Dec)
                                 { R = {}; R.Kind = Kind::Slider; R.Label = Label; R.Value = Value; R.Minimum = Lo;
                                   R.Maximum = Hi; R.Unit = Unit; R.Decimals = Dec; Rows.push_back(R); };
            const auto Toggle  = [&](const char* Label, bool* Flag)
                                 { R = {}; R.Kind = Kind::Switch; R.Label = Label; R.Flag = Flag; Rows.push_back(R); };
            const auto Readout = [&](const char* Label, const char* Text)
                                 { R = {}; R.Kind = Kind::Readout; R.Label = Label; R.Text = Text; Rows.push_back(R); };

            switch (Row.TypeOrdinal)
            {
                case RowCamera:
                {
                    Heading("Transform");
                    R = {}; R.Kind = Kind::Vector; R.Label = "Position";
                    R.Vector3 = BrowserCameraPosition; R.ReadOnly = true; Rows.push_back(R);

                    Heading("Movement");
                    Slider("Speed", &BrowserCameraSpeed, 0.1f, 20.0f, "m/s", 2u);
                    Slider("Field of view", &BrowserCameraFov, 20.0f, 120.0f, "\u00B0", 1u);

                    // The render settings hang off the camera, exactly as the mock proposed: they describe how
                    //    THIS view is resolved, so they belong to the view rather than floating in a global panel.
                    Heading("Render Settings");
                    Slider("Candidates",      &BrowserCandidates, 1.0f, 32.0f, "", 0u);
                    Slider("Extra candidates",&BrowserExtra,      0.0f,  8.0f, "", 0u);
                    Toggle("Auto exposure",   &BrowserAutoExposure);
                    Slider("Exposure",        &BrowserExposure,   0.1f,  4.0f, "", 2u);
                    Readout("Adapted",        BrowserExposureText);
                    Toggle("Temporal reuse",  &BrowserTemporal);
                    Toggle("Spatial reuse",   &BrowserSpatial);
                    Toggle("Alias pick",      &BrowserAlias);
                    Toggle("Denoise",         &BrowserDenoise);
                    break;
                }
                case RowLight:
                    if (RowOrdinal == BrowserApertureRow)
                    {
                        // The aperture is a hole, so it has nothing to emit and nothing to set. What it has is
                        //    an answer to the only question worth asking about it: is daylight coming through
                        //    right now, and where is it landing?
                        Heading("Roof Oculus");
                        Readout("Opening",  "1.50 m circle, centred 2.10 m in");
                        Readout("Daylight", BrowserApertureText);
                        Readout("Note",     "the sky lights the room through this");
                        break;
                    }
                    Heading("Emission");
                    Readout("Material", "Ceiling Light");
                    Slider("Illuminance", &BrowserLuminaire, 0.0f, 200.0f, "lx", 0u);
                    break;

                case RowSky:
                    Heading("Atmosphere");
                    Slider("Quality",   &BrowserSkyQuality, 0.0f, 4.0f, "", 0u);   // Off … Ultra
                    Slider("Sun lux",   &BrowserSunLux,     0.0f, 200000.0f, "lx", 0u);
                    Slider("Altitude",  &BrowserAltitude,   0.0f, 10000.0f, "m", 0u);
                    Toggle("Lights scene", &BrowserSkyLighting);
                    Toggle("Night sky",    &BrowserNightSky);
                    Slider("Stars",        &BrowserStarBrightness, 0.0f, 2.0f, "", 2u);
                    // A7b. Turbidity is what makes a sunrise differ from a sunset, so the two controls sit
                    //    together: the day's mean haze, and how far it swings between clean dawn and dusty dusk.
                    //    Swing 0 is the identity switch — every hour reverts to the pre-A7b sky.
                    Slider("Turbidity",    &BrowserTurbidity,      0.0f, 4.0f, "", 2u);
                    Slider("Dawn/dusk",    &BrowserTurbiditySwing, 0.0f, 1.5f, "", 2u);
                    Readout("Air now",     BrowserTurbidityText);
                    Readout("Model", "LUT + multiple scattering (A2)");
                    break;

                case RowSun:
                    Heading("Clock");
                    // Time of day is the authoritative quantity; elevation and azimuth are read back from it
                    //    rather than being separately settable, so the two can never disagree.
                    Slider("Time of day", &BrowserTimeOfDay, 0.0f, 24.0f, "h", 2u);
                    Slider("Rate",        &BrowserClockRate, 0.0f, 3600.0f, "x", 0u);
                    Heading("Position");
                    Readout("Elevation", BrowserSunElevationText);
                    Readout("Azimuth",   BrowserSunAzimuthText);
                    Heading("Site");
                    Slider("Latitude",  &BrowserLatitude,  -90.0f, 90.0f, "d", 1u);
                    break;

                case RowMoon:
                    Heading("Moon");
                    Readout("Phase",     BrowserMoonPhaseText);
                    Readout("Elevation", BrowserMoonElevationText);
                    Readout("Azimuth",   BrowserMoonAzimuthText);
                    Heading("Disc");
                    // ⚠️ A multiple of the TRUE angular size, never a replacement for it, so 1.0 always means
                    //    the real moon and the readout below says what that works out to on screen.
                    Slider("Size",       &BrowserMoonScale, 0.25f, 12.0f, "x", 2u);
                    Readout("Subtends",  BrowserMoonSizeText);
                    Readout("Surface",   BrowserMoonLuminanceText);
                    Readout("Status",    "not yet a light source (A7)");
                    break;

                case RowFolder:
                {
                    Heading("Folder");
                    Readout("Kind", "container");
                    Heading("Colour");
                    R = {}; R.Kind = Kind::Tint; R.Label = "Tint";
                    R.Tint    = &Browser.Outliner().Row(RowOrdinal).Tint;
                    R.HasTint = &Browser.Outliner().Row(RowOrdinal).HasTint;
                    Rows.push_back(R);
                    break;
                }

                default:
                {
                    Heading("Object");
                    char Material[32];
                    std::snprintf(Material, sizeof(Material), "material_%u", Row.Payload);
                    static char MaterialText[32];
                    std::snprintf(MaterialText, sizeof(MaterialText), "%s", Material);
                    Readout("Material", MaterialText);
                    Readout("State", Row.Locked ? "locked" : (Row.Dynamic ? "dynamic" : "static"));
                    break;
                }
            }
        });
    Panel.ApplyTheme();

    //──────────────────────────────────────────────────────────────────────────
    // Control Centre — top notch + pull-down shade (engine overlay, drawn above every ImGui window)
    //──────────────────────────────────────────────────────────────────────────
    // Typefaces: every static face under EngineContent/FontArchives, loaded once into the dynamic atlas (Vulkan backend
    //    rasterises glyphs on demand). The Fonts tab reads the registry; PixelSpace text honours the applied face.
    Frontier::TypefaceRegistry Typefaces;
    (void)Typefaces.Load("EngineContent/FontArchives");
    Frontier::TypefaceRegistry::Install(&Typefaces);

    Frontier::ControlCentreHost ControlCentre;
    ControlCentre.AssignProjectName("Project-Zero");
    (void)ControlCentre.Initialize(Surface.QueryWidth(), Surface.QueryHeight());

    // The hosts are seeded from the configuration loaded before bring-up; every Apply / debounced dashboard change
    //    writes the file back.
    ControlCentre.SeedSettings(Configuration.Query().Render);
    ControlCentre.AccessAppearance().Seed(Configuration.Query().Appearance);
    ControlCentre.AccessInput().Seed(Configuration.Query().Input);
    ControlCentre.AccessNotifications().Seed(Configuration.Query().Notifications);
    Frontier::PixelSpace OverlaySurface;

    // R2 debug popup (F3) — seeded from [render] debug_view / occlusion_culling / alias_pick.
    Frontier::DiagnosticInspector Diagnostics;
    Diagnostics.Seed(static_cast<Frontier::DebugViewCategory>(Configuration.Query().Backend.DebugView), Configuration.Query().Backend.OcclusionCulling,
                     Configuration.Query().Backend.AliasPick);
    Integrator.AssignAliasPick(Configuration.Query().Backend.AliasPick);   // R6 row 3: persisted F5 state applies from the first frame

    // Dashboard-driven engine services: quality ladder, toasts, frame telemetry
    Frontier::FidelityClassifier Fidelity;
    Frontier::NotificationQueue  Notifications;
    Frontier::TelemetryMetrics   Telemetry;
    {
        // R1: announce the resolved ray-tracing backend once; a downgrade from an explicit request is an Info toast.
        const Frontier::RayTracingRequestCategory Req = Surface.QueryRayTracingRequest();
        const Frontier::RayTracingTierCategory    Use = Surface.QueryRayTracingTier();
        const bool Downgraded = Req != Frontier::RayTracingRequestCategory::Auto && static_cast<uint32_t>(Use) + 1u < static_cast<uint32_t>(Req);
        if (Downgraded)
        {
            char Body[128];
            std::snprintf(Body, sizeof(Body), "%s requested, device supports %s", Frontier::RayTracingCapabilitySet::RequestName(Req), Frontier::RayTracingCapabilitySet::TierName(Use));
            Notifications.Push("Ray-tracing tier downgraded", Body);
        }
    }
    uint32_t AppliedSettingsRevision = ~0u;   // forces the first application
    float    SettingsQuietSeconds    = 0.0f;  // [s] since the last change; the toast waits for the slider to rest
    bool     SettingsToastPending    = false;
    uint32_t AppliedAppearanceRevision = 0u;
    bool     AppearanceEverApplied     = false;
    float    FrameCapSeconds           = 0.0f;   // [s] 0 = unlimited (Display → Frame Cap)
    uint32_t FixedRenderHeight         = 0u;     // [px] 0 = native  (Display → Resolution)   // AppearanceInspector::Apply bumps its own revision
    uint32_t AppliedInputRevision      = 0u;
    uint32_t AppliedNotifyRevision     = 0u;
    bool     BakeAnnounced             = false;  // "Baking Complete" = temporal accumulation reached BakeFrameCount
    constexpr uint32_t BakeFrameCount  = 256u;
    std::string LastSaveError;                   // de-duplicates the "Autosave Errors" toast

    // Push the Control Centre settings into the renderer. Called whenever the settings revision changes.
    auto ApplyControlCentreSettings = [&](const Frontier::ControlCentreSettings& S, bool Announce)
    {
        Fidelity.AssignCategory(S.Quality);
        const Frontier::FidelityCriteria Criteria = Fidelity.QueryActiveCriteria();

        // The quality tier sets the ReSTIR budget; the GI / AA tiles override the tier's own defaults.
        Integrator.AssignCandidatesPerPixel(Criteria.ReSTIRCandidateSampleCount);
        Integrator.AssignExtraCandidateCount(Criteria.ReSTIRExtraCandidateCount);
        Integrator.AssignGlobalIllumination(S.GlobalIllumination);
        Integrator.AssignAntiAliasing(S.AntiAliasing);
        Notifications.AssignEnabled(S.Notifications);

        if (Announce)
        {
            char Body[96];
            std::snprintf(Body, sizeof(Body), "%s  |  %u candidates, %u extra, GI %s, AA %s, scale %d%%",
                          Frontier::FidelityLabel(S.Quality), Criteria.ReSTIRCandidateSampleCount,
                          Criteria.ReSTIRExtraCandidateCount, S.GlobalIllumination ? "on" : "off",
                          S.AntiAliasing ? "on" : "off", static_cast<int>(S.RenderScale * 100.0f + 0.5f));
            if (ControlCentre.QueryNotifications().QueryApplied().RenderFinished) Notifications.Push("Render settings applied", Body);
        }
    };

    Camera.AssignAspectRatio(
        static_cast<float>(Surface.QueryWidth()) /
        static_cast<float>(Surface.QueryHeight()));

    Logger.RecordMessage(Frontier::DiagnosticSeverity::Information,
                         "Bootstrap", "Entering render loop.");

    //──────────────────────────────────────────────────────────────────────────
    // Spatial interface — the world-space panel, composited over the resolved scene
    //──────────────────────────────────────────────────────────────────────────
    // The engine owns the draw (InterfaceExchange) and the shapes (InterfaceStructure); this project owns what the
    //    figures MEAN — the trial sequence composes them and normalises every value before writing it. The overlay
    //    callback is the only place the two meet, and it hands the engine nothing but a command buffer.
    Frontier::InterfaceExchange      Interface;
    Frontier::InterfaceStructure     InterfaceFigures;
    Frontier::InterfaceSequence      InterfaceCompose;
    Frontier::MotionIntegrator       InterfaceMotion;
    Frontier::ProjectZero::InterfaceTrialSequence InterfaceTrial;
    bool     InterfaceReady        = false;
    uint32_t InterfaceGeneration   = 0xFFFFFFFFu;   // forces the first Resize
    double   InterfaceElapsed      = 0.0;           // [s]

    // Filled once per frame just before RecordAndPresent; the overlay callback reads it during recording.
    Frontier::InterfaceViewClip InterfaceViewOfFrame{};

    Frontier::ProjectZero::InterfaceAudioSequence InterfaceAudio;
    bool InterfaceAudioReady = false;

    // P3/P4: the director and the second screen it switches to. Screen 0 is the live trial panel; screen 1 is a
    //    static card built from P1 text and a P4-converted icon, which exists so the director has two real
    //    screens to move between rather than being wired up against a single one and never exercised.
    Frontier::InterfaceScreenSequence InterfaceDirector;
    bool     InterfaceDirectorReady = false;
    uint32_t InterfaceScreenShown   = 0u;
    bool     ScreenKeyHeldLastFrame = false;
    constexpr uint32_t kTrialScreen = 0u;
    constexpr uint32_t kAboutScreen = 1u;

    // P2: previous-frame mouse state, so a press is detected as an edge rather than a level.
    bool PointerHeldLastFrame = false;

    if (Interface.Bring(Surface.QueryDevice(), Surface.QueryPhysicalDevice(),
                        Surface.QueryCycleSlotCount(), Surface.QueryColourFormat(), Surface.QueryDepthFormat()))
    {
        // Place the panel in the ROOM rather than at the world origin. ShowroomStructure publishes the anchor it
        //    reserved for exactly this — above the plinth, tilted toward the eye — so the level owns where the
        //    interface hangs and the trial sequence owns what is on it. Any other level keeps the default upright
        //    placement, which is why this is conditional rather than unconditional.
        const bool ShowroomLevel = Level.QueryName() == "Showroom" || Level.QueryName() == "ShowroomDrop";

        // Shared by the trial panel and every other screen, so they all hang in the same place. Declared out here
        //    rather than inside the branch because the director's second screen needs the same placement.
        Frontier::PlanePlacement PanelPlacementForScreens;
        PanelPlacementForScreens.RotationX = 1.57079633f;

        if (ShowroomLevel)
        {
            const Frontier::Vector3 Anchor = Frontier::ProjectZero::ShowroomStructure::QueryPanelOrigin();
            Frontier::PlanePlacement PanelPlacement;
            PanelPlacement.Origin = Frontier::PlaneOrigin{ Anchor.x, Anchor.y, Anchor.z };
            // π/2 stands the panel up (local +Y → world +Z); the showroom's tilt then leans it back toward the eye.
            PanelPlacement.RotationX = 1.57079633f + Frontier::ProjectZero::ShowroomStructure::QueryPanelTilt();
            PanelPlacement.Scale     = 2.2f;   // the trial layout is authored at ~0.14 m across; this reads at 2 m
            InterfaceTrial.AssignPanelPlacement(PanelPlacement);
            PanelPlacementForScreens = PanelPlacement;
        }

        InterfaceTrial.Construct(InterfaceFigures, InterfaceMotion);

        //──────────────────────────────────────────────────────────────────────
        // P3 + P4 — a second screen, and the director that moves between them
        //──────────────────────────────────────────────────────────────────────
        // Built from the phases that came before rather than from anything new: the card is a Surface figure, its
        //     caption is P1 stroke text, and the tick is a P4-converted lucide path. All of it lands in the same
        //     batch as the trial panel, so two screens still cost one draw.
        {
            Frontier::InterfaceFigure Card;
            Card.Category     = Frontier::InterfaceCategory::Surface;
            Card.HalfWidth    = 0.090f;
            Card.HalfHeight   = 0.055f;
            Card.CornerRadius = 0.008f;
            Card.Palette      = Frontier::PaletteSlot::Housing;
            Card.Placement    = PanelPlacementForScreens;
            const uint32_t AboutRoot = InterfaceFigures.Construct(Card);

            Frontier::TextPlacement Caption;
            Caption.OriginY     =  0.014f;
            Caption.OriginZ     =  0.0020f;
            Caption.CapHeight   =  0.016f;
            Caption.StrokeWidth =  0.0016f;
            Caption.Alignment   = Frontier::TextAlignment::Centre;
            (void)Frontier::InterfaceTextProjection::Compose(InterfaceFigures, AboutRoot, "SLATE", Caption);

            Caption.OriginY   = -0.010f;
            Caption.CapHeight =  0.009f;
            Caption.Palette   = Frontier::PaletteSlot::MarkingMute;
            (void)Frontier::InterfaceTextProjection::Compose(InterfaceFigures, AboutRoot, "SHOWROOM P4", Caption);

            Frontier::VectorPlacement Tick;
            Tick.OriginX     =  0.060f;
            Tick.OriginY     = -0.028f;
            Tick.OriginZ     =  0.0020f;
            Tick.Extent      =  0.022f;
            Tick.StrokeWidth =  0.0018f;
            Tick.Palette     = Frontier::PaletteSlot::Confirm;
            const Frontier::VectorConversionMetrics Converted =
                Frontier::InterfaceVectorCodec::Compose(InterfaceFigures, AboutRoot, "M20 6 L9 17 L4 12", Tick);

            InterfaceDirector.Construct(kTrialScreen, { InterfaceTrial.QueryHousingOrdinal() },
                                        Frontier::TransitionConfiguration{ Frontier::TransitionCategory::Fade, 0.30f, 0.0f });
            InterfaceDirector.Construct(kAboutScreen, { AboutRoot },
                                        Frontier::TransitionConfiguration{ Frontier::TransitionCategory::Wipe, 0.35f, 0.0f });
            InterfaceDirector.Present(kTrialScreen);
            InterfaceDirectorReady = true;

            Logger.RecordMessage(Frontier::DiagnosticSeverity::Information, "Interface",
                                 "Director ready: TAB switches screens. The card carries " +
                                 std::to_string(Converted.FigureCount) + " converted vector segments.");
        }

        // Bind the panel to the audio transport: turning the progress bar changes the engine note. Failure is not
        //    fatal — a machine with no sound device still renders the scene, it just does so quietly.
        Frontier::ProjectZero::InterfaceAudioConfiguration AudioConfiguration;
        AudioConfiguration.UseNullDriver = SilentAudio;
        std::string AudioError;
        InterfaceAudioReady = InterfaceAudio.Construct(AudioConfiguration, &AudioError);
        Logger.RecordMessage(InterfaceAudioReady ? Frontier::DiagnosticSeverity::Information
                                                 : Frontier::DiagnosticSeverity::Warning,
                             "Audio",
                             InterfaceAudioReady
                                 ? "Panel bound to audio: drag the progress bar to change the engine note."
                                 : "Audio unavailable, the panel renders silently - " + AudioError);
        InterfaceReady = true;
        Logger.RecordMessage(Frontier::DiagnosticSeverity::Information, "Interface",
                             "Spatial interface ready: " + std::to_string(InterfaceTrial.QueryFigureCount()) +
                             " figures, depth test " + (Interface.IsDepthTested() ? "on" : "off") + ".");
    }
    else
    {
        Logger.RecordMessage(Frontier::DiagnosticSeverity::Warning, "Interface",
                             "Spatial interface unavailable - the scene renders without the panel.");
    }

    // Recorded after the scene resolves and before the blit, so the panel is part of the presented image.
    Surface.AssignOverlaySequence([&](void* Command, uint32_t CycleSlot) noexcept
    {
        if (!InterfaceReady) return;
        Interface.RecordInterface(Command, CycleSlot, InterfaceViewOfFrame);
    });

    //──────────────────────────────────────────────────────────────────────────
    // Input exchange — filled each frame by GLFW callbacks
    //──────────────────────────────────────────────────────────────────────────
    Frontier::InputExchange Input;

    //──────────────────────────────────────────────────────────────────────────
    // Render loop
    //──────────────────────────────────────────────────────────────────────────
    using Clock    = std::chrono::high_resolution_clock;
    using Duration = std::chrono::duration<float>;

    auto PreviousTime = Clock::now();

    while (!Surface.CloseRequested() && !Panel.Convert<bool>())
    {
        const auto  NowTime = Clock::now();
        float       Δτ      = std::chrono::duration_cast<Duration>(NowTime - PreviousTime).count();
        PreviousTime        = NowTime;

        // Clamp Δτ to prevent spiral-of-death on window drag or breakpoints
        if (Δτ > 0.1f) Δτ = 0.1f;

        // ① Poll input — GLFW callbacks forward into Input
        Surface.PollInput(Input);

        // ①b Control Centre owns the pointer while hovered / grabbed / pulled down; the camera never sees those clicks
        //    Display → UI Scale: the overlay lives in logical pixels (physical ÷ scale); the pointer is mapped the same way.
        const float    InterfaceScale = std::clamp(ControlCentre.QueryAppearance().QueryApplied().InterfaceScale / 100.0f, 0.5f, 2.0f);
        const uint32_t LogicalWidth   = std::max(1u, static_cast<uint32_t>(static_cast<float>(Surface.QueryWidth())  / InterfaceScale + 0.5f));
        const uint32_t LogicalHeight  = std::max(1u, static_cast<uint32_t>(static_cast<float>(Surface.QueryHeight()) / InterfaceScale + 0.5f));
        ControlCentre.Resize(LogicalWidth, LogicalHeight);
        ControlCentre.AdvanceInteraction(Input, Input.QueryCursorPositionX() / InterfaceScale, Input.QueryCursorPositionY() / InterfaceScale);
        ControlCentre.AdvanceLocomotion(Δτ);
        Notifications.Advance(Δτ);
        Configuration.Advance(Δτ);
        Telemetry.RecordFrame(Δτ);

        // ①b' F3 debug popup: view / HiZ / alias-pick toggles persist to [render] and restart the accumulation.
        // R6 row 3: the scheduler's Alias-pick checkbox writes the integrator directly — mirror it into the popup
        //    member before edge-detecting F5 so both toggles converge on one flag.
        Diagnostics.AssignAliasPick(Integrator.QueryConfiguration().AliasPick);
        if (Diagnostics.AdvanceInteraction(Input))
        {
            Configuration.Access().Backend.DebugView        = static_cast<Frontier::DebugViewSelection>(Diagnostics.QueryView());
            Configuration.Access().Backend.OcclusionCulling = Diagnostics.QueryOcclusion();
            Configuration.Access().Backend.AliasPick        = Diagnostics.QueryAliasPick();
            Configuration.MarkDirty();
            Integrator.AssignAliasPick(Diagnostics.QueryAliasPick());   // R6 row 3: F5 flips the kernel's pick live
            Integrator.ResetAccumulation();
        }

        // ①c Dashboard settings → renderer (only when something changed)
        {
            const Frontier::ControlCentreSettings& S = ControlCentre.QuerySettings();
            if (S.Revision != AppliedSettingsRevision)
            {
                const bool First = AppliedSettingsRevision == ~0u;
                ApplyControlCentreSettings(S, false);      // renderer follows every tick (live slider)
                AppliedSettingsRevision = S.Revision;
                if (!First) { Configuration.Access().Render = S; Configuration.MarkDirty(); }   // debounced write, one per gesture
                SettingsQuietSeconds = 0.0f;
                SettingsToastPending = !First;
            }
            else if (SettingsToastPending)
            {
                SettingsQuietSeconds += Δτ;
                if (SettingsQuietSeconds >= 0.4f)          // one toast per gesture, not per drag tick
                {
                    ApplyControlCentreSettings(S, true);
                    SettingsToastPending = false;
                }
            }
        }

        // ①d Appearance page → Apply (explicit, dialogue-confirmed when leaving dirty). Display settings are consumed
        //    here: V-Sync → swapchain present mode, fullscreen → GLFW monitor switch, frame cap → loop pacing below,
        //    resolution → render-target size (step ④).
        {
            const Frontier::AppearanceInspector& A = ControlCentre.QueryAppearance();
            if (A.QueryRevision() != AppliedAppearanceRevision)
            {
                const Frontier::AppearanceSettings& P = A.QueryApplied();
                AppliedAppearanceRevision = A.QueryRevision();
                const bool FirstAppearance = !AppearanceEverApplied;
                AppearanceEverApplied = true;
                if (!FirstAppearance)   // start-up seed: apply silently, nothing to persist or announce
                {
                    Configuration.Access().Appearance = P;
                    if (!Configuration.Save()) std::cerr << "[Configuration] save failed: " << Configuration.QueryLastError() << "\n";
                }
                Surface.AssignPresentPacing(P.VerticalSync == Frontier::VerticalSyncCategory::Off      ? Frontier::PresentPacingCategory::VerticalSyncOff
                                          : P.VerticalSync == Frontier::VerticalSyncCategory::Adaptive ? Frontier::PresentPacingCategory::VerticalSyncAdaptive
                                                                                                        : Frontier::PresentPacingCategory::VerticalSyncOn);
                Surface.AssignFullscreen(P.Fullscreen);
                FrameCapSeconds = P.FrameCap == Frontier::FrameCapCategory::Cap60  ? 1.0f / 60.0f
                                : P.FrameCap == Frontier::FrameCapCategory::Cap120 ? 1.0f / 120.0f
                                : P.FrameCap == Frontier::FrameCapCategory::Cap144 ? 1.0f / 144.0f : 0.0f;
                FixedRenderHeight = P.Resolution == Frontier::RenderResolutionCategory::Quad1440 ? 1440u
                                  : P.Resolution == Frontier::RenderResolutionCategory::Full1080 ? 1080u
                                  : P.Resolution == Frontier::RenderResolutionCategory::Half720  ? 720u : 0u;
                char Body[128];
                const Frontier::TypefaceFamily* Fam = Typefaces.QueryFamily(P.FontFamily);
                std::snprintf(Body, sizeof(Body), "%s  |  %s  |  UI %d%%  |  radius %dpx  |  V-Sync %s%s",
                              Frontier::AppearanceInspector::QueryThemeName(P.Theme), Fam ? Fam->Name.c_str() : "default face", static_cast<int>(P.InterfaceScale),
                              static_cast<int>(P.CornerRadius),
                              P.VerticalSync == Frontier::VerticalSyncCategory::Off ? "off" : P.VerticalSync == Frontier::VerticalSyncCategory::On ? "on" : "adaptive",
                              P.Fullscreen ? "  |  fullscreen" : "");
                if (!FirstAppearance && ControlCentre.QueryNotifications().QueryApplied().RenderFinished) Notifications.Push("Appearance applied", Body);
            }
        }

        // ①e Input page → Save keybindings: sensitivity % → rad/px (50 % = base 0.00125, linear 0.25 × … 2 ×) and
        //    Invert Y-Axis into the fly-through configuration. Profile / shortcut fields are persisted but not yet
        //    consumed by the solver (flagged in the step report).
        {
            const Frontier::InputInspector& I = ControlCentre.QueryInput();
            if (I.QueryRevision() != AppliedInputRevision)
            {
                const bool First = AppliedInputRevision == 0u;
                AppliedInputRevision = I.QueryRevision();
                const Frontier::InputPreferences& P = I.QueryApplied();
                Frontier::ProjectZero::FlyThroughConfiguration C = Camera.QueryConfiguration();
                C.MouseSensitivity = 0.00125f * (0.25f + (P.MouseSensitivity / 100.0f) * 1.75f);
                C.InvertPitch      = P.InvertPitch;
                Camera.AssignConfiguration(C);
                if (!First)
                {
                    Configuration.Access().Input = P;
                    if (!Configuration.Save()) std::cerr << "[Configuration] save failed: " << Configuration.QueryLastError() << "\n";
                    char Body[96];
                    std::snprintf(Body, sizeof(Body), "%s  |  sensitivity %d%%  |  Y-axis %s",
                                  Frontier::InputInspector::QueryProfileName(P.Profile), static_cast<int>(P.MouseSensitivity), P.InvertPitch ? "inverted" : "normal");
                    if (ControlCentre.QueryNotifications().QueryApplied().RenderFinished) Notifications.Push("Keybindings saved", Body);
                }
            }
        }

        // ①f Notifications page → Save Preferences: overlay rows, toast dwell, alert gates.
        {
            const Frontier::NotificationInspector& N = ControlCentre.QueryNotifications();
            if (N.QueryRevision() != AppliedNotifyRevision)
            {
                const bool First = AppliedNotifyRevision == 0u;
                AppliedNotifyRevision = N.QueryRevision();
                const Frontier::NotificationPreferences& P = N.QueryApplied();
                Notifications.AssignHoldSeconds(P.HoldSeconds);
                Frontier::TelemetryRowStructure Rows = Telemetry.QueryRows();
                Rows.ShowMemory = P.ShowMemoryUsage;
                Rows.ShowScene  = P.ShowSceneMetadata;
                Telemetry.AssignRows(Rows);
                if (!First)
                {
                    Configuration.Access().Notifications = P;
                    if (!Configuration.Save()) std::cerr << "[Configuration] save failed: " << Configuration.QueryLastError() << "\n";
                    if (P.RenderFinished) Notifications.Push("Notification preferences saved");
                }
            }
        }

        // ①g Alert gates: "Autosave Errors" (preference writes), "Baking Complete" (accumulation converged),
        //    "Frame-rate Drops" (2 s average under 30 fps, once per episode).
        {
            const Frontier::NotificationPreferences& P = ControlCentre.QueryNotifications().QueryApplied();
            if (P.AutosaveErrors && !Configuration.QueryLastError().empty() && Configuration.QueryLastError() != LastSaveError)
            {
                LastSaveError = Configuration.QueryLastError();
                Notifications.Push("Configuration could not be saved", LastSaveError);
            }
            if (Integrator.QueryAccumulationIndex() < BakeFrameCount) BakeAnnounced = false;
            else if (!BakeAnnounced)
            {
                BakeAnnounced = true;
                if (P.BakingComplete) { char Body[64]; std::snprintf(Body, sizeof(Body), "%u frames accumulated", BakeFrameCount); Notifications.Push("Baking complete", Body); }
            }
            if (Telemetry.ConsumeFrameRateDrop(30.0f) && P.FrameRateDrops)
            {
                char Body[64]; std::snprintf(Body, sizeof(Body), "%.0f fps average over the last 2 s", static_cast<double>(Telemetry.QueryAverageFramesPerSecond()));
                Notifications.Push("Frame-rate drop", Body);
            }
        }

        // ①c World Browser — mirror live state in, advance the animations, and decide whether it owns the pointer.
        //    The panel occupies a fixed strip on the trailing edge; the camera must not fly while the cursor is
        //    over it, and must not fly at all while a name is being typed.
        {
            // The panel is a movable window now, so its position cannot be assumed. ImGui reports whether the
            //    cursor is over it — including its title bar, resize grip and dock tab, which a hand-computed
            //    strip would miss entirely once the window is dragged anywhere.
            BrowserCoversPointer = BrowserWindowHovered;

            BrowserPointerWasDown = BrowserPointerDown;
            BrowserPointerDown    = Input.IsMouseButtonPressed(Frontier::MouseButtonCategory::ButtonLeft);

            const Frontier::Vector3 Eye = Camera.QuerySpatialLocation();
            BrowserCameraPosition[0] = Eye.x; BrowserCameraPosition[1] = Eye.y; BrowserCameraPosition[2] = Eye.z;
            BrowserCameraSpeed = Camera.QueryFlightSpeed();
            BrowserCameraFov   = Camera.QueryConfiguration().BaseFlightSpeed > 0.0f ? BrowserCameraFov : BrowserCameraFov;

            const Frontier::ReSTIRIntegratorConfiguration& Cfg = Integrator.QueryConfiguration();
            BrowserCandidates = static_cast<float>(Cfg.CandidatesPerPixel);
            BrowserExtra      = static_cast<float>(Cfg.ExtraCandidateCount);
            BrowserExposure   = Cfg.Exposure;
            BrowserTemporal   = Cfg.TemporalReuse;
            BrowserSpatial    = Cfg.SpatialReuse;
            BrowserAlias      = Cfg.AliasPick;
            BrowserDenoise    = Cfg.Denoise;

            // A3 sky. Read-only rows are formatted here rather than in the builder so the builder stays a pure
            //    description of the panel with no formatting state of its own.
            BrowserSkyQuality = static_cast<float>(static_cast<uint32_t>(Cfg.SkyQuality));
            BrowserSunLux     = Cfg.SunIlluminance;
            BrowserAltitude   = Cfg.CameraAltitude;
            BrowserSkyLighting= Cfg.SkyLighting;
            BrowserNightSky   = Cfg.NightSky;
            BrowserStarBrightness = Cfg.StarBrightness;
            BrowserTurbidity      = Cfg.SkyTurbidity;
            BrowserMoonScale      = Cfg.MoonAngularScale;
            BrowserTurbiditySwing = Cfg.TurbiditySwing;
            {
                // The turbidity the sky is ACTUALLY being rendered with this frame, from the same curve the
                //    record is built from. Showing the mean instead would leave the one number the user watches
                //    while dragging the clock frozen at a value nothing on screen corresponds to.
                const double DayFraction = Integrator.Celestial().QuerySolarDayFraction(
                                               Integrator.Celestial().QueryTime());
                const float  Now = Frontier::QueryDiurnalTurbidity(Cfg.SkyTurbidity, Cfg.TurbiditySwing, DayFraction);
                std::snprintf(BrowserTurbidityText, sizeof(BrowserTurbidityText), "%.2f  (%.1f h)",
                              static_cast<double>(Now), DayFraction * 24.0);
            }
            BrowserAutoExposure = Integrator.Exposure().QueryConfiguration().Mode
                                == Frontier::ExposureModeCategory::Adaptive;
            {
                // The incident figure is shown beside the adapted one, because the whole question when the
                //    exposure looks wrong is which of the two readings it is following.
                const float Incident = Integrator.Exposure().QueryIncidentLuminance();
                std::snprintf(BrowserExposureText, sizeof(BrowserExposureText), "%.3f  (scene %.4f, sky %.4f)",
                              static_cast<double>(Integrator.Exposure().QueryExposure()),
                              static_cast<double>(Integrator.Exposure().QueryAdaptedLuminance()),
                              static_cast<double>(Incident));
            }
            BrowserClockRate  = static_cast<float>(Integrator.Celestial().QueryRate());
            {
                const Frontier::CelestialConfiguration& Site = Integrator.Celestial().QueryConfiguration();
                BrowserLatitude = static_cast<float>(Site.LatitudeRadians * 180.0 / 3.14159265358979);
                BrowserTimeOfDay = static_cast<float>(Integrator.Celestial().QuerySolarDayFraction(
                                       Integrator.Celestial().QueryTime()) * 24.0);

                const Frontier::HorizonDirection Sun  = Integrator.Celestial().QuerySunDirection();
                const Frontier::HorizonDirection Moon = Integrator.Celestial().QueryMoonDirection();
                std::snprintf(BrowserSunElevationText,  sizeof(BrowserSunElevationText),  "%+.1f deg", Sun.Elevation  * 180.0 / 3.14159265358979);
                std::snprintf(BrowserSunAzimuthText,    sizeof(BrowserSunAzimuthText),    "%.1f deg",  Sun.Azimuth    * 180.0 / 3.14159265358979);
                std::snprintf(BrowserMoonElevationText, sizeof(BrowserMoonElevationText), "%+.1f deg", Moon.Elevation * 180.0 / 3.14159265358979);
                std::snprintf(BrowserMoonPhaseText,     sizeof(BrowserMoonPhaseText),     "%.0f %% lit", Integrator.Celestial().QueryMoonPhase() * 100.0);
                std::snprintf(BrowserMoonAzimuthText,   sizeof(BrowserMoonAzimuthText),   "%.1f deg", Moon.Azimuth * 180.0 / 3.14159265358979);

                {
                    // Where the shaft from the roof opening lands, using the same arithmetic the proof asserts:
                    //    the aperture translated by the sun's slope over the room's height.
                    constexpr double HoleY = 2.10, TopZ = 3.0, RoomHalfX = 2.0, RoomMaxY = 4.0;
                    if (Sun.Zenith <= 0.05)
                        std::snprintf(BrowserApertureText, sizeof(BrowserApertureText), "none — the sun is down");
                    else
                    {
                        const double Travel = TopZ / Sun.Zenith;
                        const double ShaftX = 0.0   - Travel * Sun.East;
                        const double ShaftY = HoleY - Travel * Sun.North;
                        const bool   Inside = std::fabs(ShaftX) < RoomHalfX && ShaftY > 0.0 && ShaftY < RoomMaxY;
                        std::snprintf(BrowserApertureText, sizeof(BrowserApertureText),
                                      Inside ? "shaft on the floor at (%.1f, %.1f)"
                                             : "sun too low — the shaft clears the room (%.1f, %.1f)",
                                      ShaftX, ShaftY);
                    }
                }
                {
                    // The real disc is 0.259° across. Reporting the pixel figure alongside it is the honest
                    //    answer to "why is the moon so small" — it is not small, it is correct, and a 55° view
                    //    across 1080 rows genuinely puts it at about ten pixels.
                    const double TrueDegrees = 2.0 * 0.004526 * 180.0 / 3.14159265358979;
                    const double Degrees     = TrueDegrees * static_cast<double>(BrowserMoonScale);
                    // The swapchain's height, not the render target's: this block runs before the frame's
                    //    render resolution is derived, and the figure is a "what you will see" number anyway.
                    const double Pixels      = Degrees / static_cast<double>(BrowserCameraFov)
                                             * static_cast<double>(std::max(1u, Surface.QueryHeight()));
                    std::snprintf(BrowserMoonSizeText, sizeof(BrowserMoonSizeText), "%.3f deg  (%.0f px)",
                                  Degrees, Pixels);
                    // Surface brightness is held constant as the disc is scaled, so this figure does not move
                    //    with the slider — which is the point of scaling by the true solid angle.
                    const double SolidAngle = 6.28318530 * (1.0 - std::cos(0.004526));
                    const double Luminance  = static_cast<double>(Cfg.SunIlluminance) * 0.12 / SolidAngle;
                    std::snprintf(BrowserMoonLuminanceText, sizeof(BrowserMoonLuminanceText),
                                  "%.0f cd/m2 (unchanged by size)", Luminance);
                }
            }

            Browser.Advance(Δτ);

            // Drain the keyboard stream into whichever field has focus. Edit keys first, then characters: an
            //    Enter that arrived before a character in the same frame must commit before that character is
            //    inserted, or the keystroke lands in a field the user already closed.
            for (uint32_t I = 0u; I < Input.QueryEditKeyCount(); ++I)
                Browser.RecordKey(Input.QueryEditKey(I), Input.QueryEditKeyShift(I), Input.QueryEditKeyControl(I));
            for (uint32_t I = 0u; I < Input.QueryCharacterCount(); ++I)
                Browser.RecordCharacter(Input.QueryCharacter(I));

            // Escape closes the window only when no field is holding it — the callback deliberately no longer
            //    quits, because abandoning an edit must not be able to end the session.
            if (!Browser.EditingText())
                for (uint32_t I = 0u; I < Input.QueryEditKeyCount(); ++I)
                    if (Input.QueryEditKey(I) == 256u) Surface.RequestClose();

            Input.ClearTextQueue();
        }

        // ② Advance camera kinematics (frozen while either overlay owns the pointer, or a field is being typed into)
        if (!ControlCentre.CoversPointer() && !BrowserCoversPointer && !Browser.EditingText())
            Camera.AdvanceLocomotion(Input, Δτ);
        Camera.AssignAspectRatio(
            static_cast<float>(Surface.QueryWidth()) /
            static_cast<float>(Surface.QueryHeight()));

        // ③ Build ImGui draw data (calls ImGui::NewFrame → ImGui::Render internally); the Control Centre records
        //    itself onto the foreground list between NewFrame and Render via the overlay hook.
        Panel.Present(Integrator, Camera, Scene,
                      Surface.QueryWidth(), Surface.QueryHeight(),
                      [&]()
                      {
                          if (OverlaySurface.Begin(Frontier::SurfaceLayer::Above,
                                                   static_cast<float>(Surface.QueryWidth()),
                                                   static_cast<float>(Surface.QueryHeight()),
                                                   InterfaceScale))
                          {
                              // Scene overlays hang from the closed notch line; the pulled-down sheet covers the FPS
                              //    readout, while toasts are drawn after the shade so a settings change is acknowledged
                              //    on top of the dashboard that caused it.
                              const float NotchLine = ControlCentre.QueryHandleHeight();
                              if (ControlCentre.QuerySettings().FrameRateOverlay)
                                  Telemetry.ConstructTelemetryLayout(OverlaySurface, NotchLine);
                              Diagnostics.ConstructInspectorLayout(OverlaySurface, NotchLine, static_cast<float>(LogicalWidth),
                                                                   Surface.QueryVisibilityTelemetry(), Surface.QueryClusterCount(), Surface.QueryDrawIndirectCount(),
                                                                   Integrator.QueryConfiguration(), Level.QueryMaterials().QueryMetrics(),
                                                                   Textures.QueryMetrics(), MaxTextureLevels);
                              ControlCentre.ConstructControlLayout(OverlaySurface);
                              Notifications.ConstructNotificationLayout(OverlaySurface, NotchLine);
                          }

                          // ── World Browser — a real, movable window ─────────────────────────────────────────
                          // It used to record onto the foreground list, which is screen-space and belongs to no
                          //    window: nothing there can be dragged, resized, docked or z-ordered because there
                          //    is nothing underneath to own those behaviours. FloatingPanel puts a window under
                          //    the same Record() call, and not one widget inside had to change.
                          //
                          //    The notch stays on the foreground list deliberately. It is a system overlay and
                          //    must cover this window when the shade is pulled down.
                          {
                              // ⚠️ 720 wide, not 360. A property row is a 76 px label, a 104 px pill and a
                              //    90 px slider with gaps — 294 px of content plus the card's own padding — and
                              //    the properties pane is under half the panel in split mode. At 360 the row
                              //    could not fit in any arrangement, which is what pushed the sliders off the
                              //    edge. The minimum below is the same arithmetic, so the panel cannot be
                              //    dragged back into that state.
                              Frontier::FloatingPanel BrowserPanel(
                                  "World Browser##Slate",
                                  static_cast<float>(LogicalWidth) - 740.0f, 40.0f,
                                  720.0f, static_cast<float>(LogicalHeight) - 80.0f,
                                  InterfaceScale, 620.0f, 260.0f);

                              BrowserWindowHovered = BrowserPanel.PointerOverWindow();

                              if (BrowserPanel.IsOpen())
                              {
                                  Frontier::ControlPointer BrowserPointer{};
                                  BrowserPointer.X        = Input.QueryCursorPositionX() / InterfaceScale;
                                  BrowserPointer.Y        = Input.QueryCursorPositionY() / InterfaceScale;
                                  BrowserPointer.Down     = BrowserPointerDown;
                                  BrowserPointer.Pressed  = BrowserPointerDown && !BrowserPointerWasDown;
                                  BrowserPointer.Released = !BrowserPointerDown && BrowserPointerWasDown;
                                  // Only the content owns the pointer. Over the title bar, the resize grip or the
                                  //    dock tab it belongs to ImGui, and a widget that also saw it would move a
                                  //    slider while the window was being dragged.
                                  BrowserPointer.Enabled  = BrowserPanel.PointerInsideContent()
                                                         && !ControlCentre.CoversPointer();
                                  // The panel is an ImGui window with NoScrollWithMouse, so ImGui will not
                                  //    consume the wheel and the browser can route it to whichever pane the
                                  //    pointer is over.
                                  BrowserPointer.Wheel    = Input.QueryMouseScrollDelta();

                                  Browser.Record(BrowserPanel.Surface(), BrowserPanel.ContentExtent(), BrowserPointer);
                              }
                          }
                      });

        // ③b World Browser copy-back. Done after Record and BEFORE the dispatch is built, so a slider moved this
        //     frame takes effect this frame rather than one frame late — a one-frame lag on Exposure reads as the
        //     control being unresponsive.
        {
            // Each setter is a no-op when the value is unchanged and resets accumulation when it is not, so a
            //    slider that is merely hovered never restarts the image.
            Integrator.AssignCandidatesPerPixel(static_cast<uint32_t>(BrowserCandidates + 0.5f));
            Integrator.AssignExtraCandidateCount(static_cast<uint32_t>(BrowserExtra + 0.5f));
            Integrator.AssignExposure(BrowserExposure);
            Integrator.AssignTemporalReuse(BrowserTemporal);
            Integrator.AssignSpatialReuse(BrowserSpatial);
            Integrator.AssignAliasPick(BrowserAlias);
            Integrator.AssignDenoise(BrowserDenoise);

            if (Camera.QueryFlightSpeed() != BrowserCameraSpeed) Camera.AssignFlightSpeed(BrowserCameraSpeed);

            // A3 sky copy-back. Each setter is a no-op when unchanged, so merely hovering a slider never
            //    restarts the accumulated image.
            Integrator.AssignSkyQuality(static_cast<Frontier::SkyQualityCategory>(
                static_cast<uint32_t>(BrowserSkyQuality + 0.5f)));
            Integrator.AssignSunIlluminance(BrowserSunLux);
            Integrator.AssignSkyLighting(BrowserSkyLighting);
            Integrator.AssignNightSky(BrowserNightSky);
            Integrator.AssignStarBrightness(BrowserStarBrightness);
            Integrator.AssignSkyTurbidity(BrowserTurbidity);
            Integrator.AssignMoonAngularScale(BrowserMoonScale);
            Integrator.AssignTurbiditySwing(BrowserTurbiditySwing);
            {
                Frontier::ExposureConfiguration Adapt = Integrator.Exposure().QueryConfiguration();
                const Frontier::ExposureModeCategory Want = BrowserAutoExposure
                    ? Frontier::ExposureModeCategory::Adaptive : Frontier::ExposureModeCategory::Manual;
                if (Adapt.Mode != Want)
                {
                    Adapt.Mode = Want;
                    Integrator.Exposure().AssignConfiguration(Adapt);
                    // Snap on the way into adaptive, or the first seconds show the manual exposure easing away
                    //    from a value that was never a measurement.
                    if (Want == Frontier::ExposureModeCategory::Adaptive) Integrator.Exposure().Snap();
                }
            }

            {
                Frontier::CelestialConfiguration Site = Integrator.Celestial().QueryConfiguration();
                const double WantLatitude = static_cast<double>(BrowserLatitude) * 3.14159265358979 / 180.0;
                if (Site.LatitudeRadians != WantLatitude)
                {
                    Site.LatitudeRadians = WantLatitude;
                    Integrator.Celestial().AssignConfiguration(Site);
                }
                Integrator.Celestial().AssignRate(static_cast<double>(BrowserClockRate));

                // Dragging the time slider sets the clock directly. Comparing against the CURRENT fraction rather
                //    than a remembered slider value means a running clock does not fight the user's drag: the
                //    slider only writes when it genuinely differs from where time already is.
                const double NowFraction  = Integrator.Celestial().QuerySolarDayFraction(Integrator.Celestial().QueryTime());
                const double WantFraction = static_cast<double>(BrowserTimeOfDay) / 24.0;
                if (std::fabs(NowFraction - WantFraction) > 1.0 / (24.0 * 60.0))   // one minute of slack
                {
                    const double Day = Integrator.Celestial().QueryConfiguration().DayLengthSeconds;
                    const double Whole = std::floor(Integrator.Celestial().QueryTime() / Day);
                    Integrator.Celestial().AssignTime((Whole + WantFraction) * Day);
                }
            }
        }

        // ④ Build dispatch configuration from live camera + integrator state (camera motion restarts accumulation)
        //    Render scale: the kernel runs on a sub-rectangle of the storage image and the blit stretches it.
        //    Display → Resolution: Native follows the dashboard render-scale slider; a fixed preset renders at that
        //    height (window aspect preserved), never above the swapchain size, and the scale slider still multiplies it.
        const float    RenderScale  = ControlCentre.QuerySettings().RenderScale;
        const float    FixedFactor  = FixedRenderHeight > 0u ? std::min(1.0f, static_cast<float>(FixedRenderHeight) / static_cast<float>(std::max(1u, Surface.QueryHeight()))) : 1.0f;
        const uint32_t RenderWidth  = std::max(1u, static_cast<uint32_t>(static_cast<float>(Surface.QueryWidth())  * RenderScale * FixedFactor + 0.5f));
        const uint32_t RenderHeight = std::max(1u, static_cast<uint32_t>(static_cast<float>(Surface.QueryHeight()) * RenderScale * FixedFactor + 0.5f));
        // A3 — advance the sky's clock. This is the ONLY place time moves; every sun, moon and star position is
        //    derived from it, so there is nothing else to keep in step.
        Integrator.Celestial().Advance(Δτ);

        // A6b — adaptive exposure. The measurement is one or two frames stale because it is read from the cycle
        //    slot the GPU has already finished with; against time constants of half a second and up that is
        //    invisible, and it is what keeps the read from stalling the CPU on the GPU.
        {
            // A7e ⚠️ The incident reading FIRST, then the frame's. Both feed one reconciliation, and the order
            //     only matters in that neither may be a frame stale with respect to the other.
            Integrator.ObserveDaylight();
            const float Measured = Surface.QueryAverageLogLuminance();
            if (Measured > -1.0e8f) Integrator.Exposure().ObserveLuminance(Measured);
            Integrator.Exposure().Advance(Δτ);
        }

        Integrator.ObserveCamera(Camera, RenderWidth, RenderHeight);
        if (Telemetry.QueryRows().ShowScene)
        {
            char Line[96];
            std::snprintf(Line, sizeof(Line), "%s  |  %u tris  |  %u luminaire tris  |  %ux%u  |  frame %u  |  %s",
                          Level.QueryName().c_str(), Level.QueryTriangleCount(), LuminaireCount, RenderWidth, RenderHeight, Integrator.QueryAccumulationIndex(),
                          Frontier::RayTracingCapabilitySet::TierName(Surface.QueryRayTracingTier()));
            Frontier::TelemetryRowStructure Rows = Telemetry.QueryRows(); Rows.SceneLine = Line; Telemetry.AssignRows(Rows);
        }
        // A7 — upload the frame's sky. Built from the same clock as the dispatch and written immediately before
        //    it, so the two can never describe different instants.
        Surface.AssignSkyRecord(Integrator.BuildSkyRecord());

        const Frontier::DispatchConfiguration Dispatch = Integrator.BuildDispatch(
            Camera,
            RenderWidth,
            RenderHeight,
            AlphaMaskedMaterialCount,
            LuminaireCount);

        // ④b R2 front end: same camera, reverse-Z infinite projection; AA jitter is a per-frame Halton(2,3) offset shared
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
            Frame.DebugView        = Diagnostics.QueryView();
            Frame.OcclusionCulling = Diagnostics.QueryOcclusion();
            Frame.ConeCulling      = false;   // the kernel shades both faces; cone culling would remove back-facing walls seen from outside
            Surface.AssignVisibilityFrame(Frame);
        }

        // ④b Spatial interface — animate the figures, re-bind on a swapchain rebuild, publish this frame's view.
        if (InterfaceReady)
        {
            // Every image view the interface renders into is destroyed by a swapchain rebuild, so re-Resize whenever
            //    the generation moves. Comparing generations (rather than extents) also catches a rebuild that keeps
            //    the same size, e.g. a present-pacing change.
            const uint32_t Generation = Surface.QueryTargetGeneration();
            if (Generation != InterfaceGeneration)
            {
                if (Interface.Resize(RenderWidth, RenderHeight, Surface.QueryColourView(), Surface.QueryDepthView()))
                {
                    InterfaceGeneration = Generation;
                }
                else
                {
                    InterfaceReady = false;
                    Logger.RecordMessage(Frontier::DiagnosticSeverity::Warning, "Interface",
                                         "Interface Resize failed after a swapchain rebuild - panel disabled.");
                }
            }

            if (InterfaceReady)
            {
                InterfaceElapsed += static_cast<double>(Δτ);

                // P2 — pointer interaction. The cursor becomes a world ray, the engine reports which figure it
                //     struck, and the trial sequence decides what that means. Done BEFORE AdvanceTrial so a press
                //     this frame is reflected in the same frame's animation rather than one frame late.
                {
                    const Frontier::Vector3 Eye     = Camera.QuerySpatialLocation();
                    const Frontier::Vector3 Forward = Camera.QueryForwardVector();
                    const Frontier::Vector3 Right   = Camera.QueryRightVector();
                    const Frontier::Vector3 Upward  = Camera.QueryUpwardVector();
                    const float EyeArray[3]     = { Eye.x, Eye.y, Eye.z };
                    const float ForwardArray[3] = { Forward.x, Forward.y, Forward.z };
                    const float RightArray[3]   = { Right.x, Right.y, Right.z };
                    const float UpArray[3]      = { Upward.x, Upward.y, Upward.z };

                    const Frontier::PointerRay Ray = Frontier::InterfacePointerProjection::ConstructViewportRay(
                        Input.QueryCursorPositionX(), Input.QueryCursorPositionY(),
                        Surface.QueryWidth(), Surface.QueryHeight(),
                        EyeArray, ForwardArray, RightArray, UpArray,
                        Dispatch.FieldOfViewTanHalf, Camera.QueryAspectRatio());

                    const Frontier::PointerContact Contact =
                        Frontier::InterfacePointerProjection::Project(InterfaceFigures, InterfaceCompose, Ray);

                    // Edge, not level: only the frame the button goes down counts as a press, so holding does not
                    //     retrigger a toggle sixty times a second.
                    const bool Held    = Input.IsMouseButtonPressed(Frontier::MouseButtonCategory::ButtonLeft);
                    const bool Pressed = Held && !PointerHeldLastFrame;
                    PointerHeldLastFrame = Held;

                    // P3: a screen that is not fully present must not be clickable. The director already clears
                    //     PointerTarget while a screen moves, but discarding the contact here as well means a
                    //     press cannot be queued during a transition and applied the instant it lands.
                    const bool ScreenSettled = !InterfaceDirectorReady ||
                                               InterfaceDirector.QueryInteractiveScreen() == kTrialScreen;
                    InterfaceTrial.ApplyPointer(InterfaceFigures, ScreenSettled ? Contact : Frontier::PointerContact{},
                                                ScreenSettled && Pressed, ScreenSettled && Held);
                }

                // P3 — TAB switches screens, on the key EDGE so holding it does not flip every frame.
                if (InterfaceDirectorReady)
                {
                    const bool Held = Input.IsKeyPressed(Frontier::VirtualKeyCategory::KeyTab);
                    if (Held && !ScreenKeyHeldLastFrame && !InterfaceDirector.IsTransitioning())
                    {
                        InterfaceScreenShown = (InterfaceScreenShown == kTrialScreen) ? kAboutScreen : kTrialScreen;
                        InterfaceDirector.Present(InterfaceScreenShown);
                    }
                    ScreenKeyHeldLastFrame = Held;

                    // Advance BEFORE the composition below, or a screen renders one frame stale.
                    InterfaceDirector.AdvanceScreens(InterfaceFigures, Δτ);
                }

                InterfaceTrial.AdvanceTrial(InterfaceFigures, InterfaceMotion, InterfaceElapsed, true);

                // Publish the panel's values as audio demand and service the device. After AdvanceTrial so the
                //     note follows the value the user just set rather than lagging it by a frame.
                if (InterfaceAudioReady) InterfaceAudio.AdvanceAudio(InterfaceTrial, Δτ);

                // The panel is world-space: it uses the same view→clip the visibility raster builds, so the figures
                //    sit in the room and reproject exactly like geometry rather than floating in screen space.
                // Same camera the visibility raster uses, rebuilt here because Frame is scoped to the block below.
                Frontier::CameraClipConfiguration PanelCamera;
                PanelCamera.Origin             = Camera.QuerySpatialLocation();
                PanelCamera.Forward            = Camera.QueryForwardVector();
                PanelCamera.Right              = Camera.QueryRightVector();
                PanelCamera.Up                 = Camera.QueryUpwardVector();
                PanelCamera.TanHalfFieldOfView = Dispatch.FieldOfViewTanHalf;
                PanelCamera.AspectRatio        = Camera.QueryAspectRatio();
                PanelCamera.NearDistance       = Camera.QueryNearPlaneDistance();

                const Frontier::Matrix4x4 ViewClip = Frontier::ConstructViewClipProjection(PanelCamera);
                for (int Column = 0; Column < 4; ++Column)
                    for (int Row = 0; Row < 4; ++Row)
                        InterfaceViewOfFrame.ViewClip[Column * 4 + Row] = ViewClip.Columns[Column][Row];

                const Frontier::Vector3 Eye     = Camera.QuerySpatialLocation();
                const Frontier::Vector3 Forward = Camera.QueryForwardVector();

                // Depth ordering needs the eye and forward axis; the full transform travels in the raster constants.
                Frontier::InterfaceViewConfiguration ComposeView;
                ComposeView.EyeX = Eye.x;         ComposeView.EyeY = Eye.y;         ComposeView.EyeZ = Eye.z;
                ComposeView.ForwardX = Forward.x; ComposeView.ForwardY = Forward.y; ComposeView.ForwardZ = Forward.z;
                InterfaceCompose.AssignView(ComposeView);
                InterfaceCompose.Advance(InterfaceFigures, InterfaceElapsed);

                InterfaceViewOfFrame.EyeX = Eye.x;
                InterfaceViewOfFrame.EyeY = Eye.y;
                InterfaceViewOfFrame.EyeZ = Eye.z;
                InterfaceViewOfFrame.RenderWidth  = RenderWidth;
                InterfaceViewOfFrame.RenderHeight = RenderHeight;

                Interface.UploadInstances(InterfaceCompose.QueryInstances(),
                                          InterfaceCompose.QueryInstanceCount(),
                                          Surface.QueryCycleSlot());
            }
        }

        // ④c D3 — advance instance transforms and refresh them in place. No reallocation and no device stall, so
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

        // ⑤ Cull → raster → HiZ → resolve → kernel, blit to swapchain, submit ImGui, present
        Surface.RecordAndPresent(Dispatch);

        Integrator.IncrementAccumulationIndex();

        // Display → Frame Cap: sleep out the remainder of the frame budget (coarse sleep, then spin the last ~1 ms so
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

    Logger.RecordMessage(Frontier::DiagnosticSeverity::Information,
                         "Shutdown", "Render loop exited cleanly.");

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
