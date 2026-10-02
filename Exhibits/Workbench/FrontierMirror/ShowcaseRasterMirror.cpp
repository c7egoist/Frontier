//============================================================================================================================================
//                                                   SHOWCASERASTERMIRROR.CPP
//============================================================================================================================================
// 📦 The GI-OFF / RT-OFF render mode of the product, run on the CPU with the engine's OWN code — nothing here is a
//    lookalike renderer.  Every stage below is a shipped engine translation unit:
//
//      level    Engine/ContentInterchange/ShowcaseStructure   — the DEFAULT level (`--scene showcase`), r7,
//                                                                kShowcaseGridSide² = 20 × 20 = 400 placements:
//                                                                380 ShaderBalls + the 20 emissive spheres of row 8
//      scene    Engine/GeometricRaster/SceneStructure         — the same registration/Finalise the app performs
//      raster   Engine/GeometricRaster/VisibilityRaster       — the shipped visibility buffer + direct-only shade
//      sky      Engine/Host/CelestialSequence                  — the real sun/sky/twilight/star/moon/cloud/fog model,
//                                                                handed to the raster through its own ApplyTo
//      tone     Engine/DisplayPresentation/ColourTransfer     — the engine's single linear → display definition
//
//    There is no material model, no sky gradient and no shading term authored in this file.  It only selects a
//    camera, asks the engine to render, and writes the bytes out.  That is the whole point: what the user sees on
//    their PC with Raytracing OFF and Global Illumination OFF is what this writes, minus the window.
//
//    Usage: ShowcaseRasterMirror --out <file.png> [--view default|grid400|grid|metals|glass|wide|panel|glints|
//                                                          paint-{candy,glitter,iridescent,cobalt,copper}[-macro]]
//                                [--width 960] [--height 540] [--sun 15.0]

#include "GeometricRaster/VisibilityRaster.h"
#include "GeometricRaster/CameraProjection.h"
#include "GeometricRaster/SceneStructure.h"
#include "GeometricRaster/GeometryStructure.h"
#include "ContentInterchange/ShowcaseStructure.h"
#include "CelestialSequence.h"

#define STB_IMAGE_WRITE_IMPLEMENTATION
#include "stb_image_write.h"

#include <cmath>
#include <cstdio>
#include <cstring>
#include <cstdlib>
#include <stdexcept>
#include <string>
#include <vector>

using namespace Frontier;
using namespace Frontier::HostRuntime;

namespace {

unsigned g_Checks = 0u;
void Check(bool Ok, const char* Message)
{
    ++g_Checks;
    if (!Ok) { std::fprintf(stderr, "[showcase-raster] FAIL %s\n", Message); std::exit(1); }
    std::printf("[showcase-raster] pass  %s\n", Message);
}

// ── The level, registered exactly as the application registers it ───────────────────────────────────────────────────
// ShowcaseStructure publishes world-space triangles, three corner normals per triangle, and the material records.
//    SceneStructure wants meshes; the triangles are already world space, so every instance carries identity and the
//    grouping is purely by material slot, which is what keeps the registration one-to-one with the authored level.
uint32_t BuildLevel(SceneStructure& Level, const ShowcaseStructure& Showcase)
{
    const auto& Triangles    = Showcase.QueryTriangles();
    const auto& CornerNormal = Showcase.QueryCornerNormals();
    const auto& Materials    = Showcase.QueryMaterials();

    std::vector<uint32_t> Slot(Materials.size(), 0u);
    for (size_t I = 0; I < Materials.size(); ++I) Slot[I] = Level.RegisterMaterial(Materials[I]);

    // One mesh per material slot, in authored order.
    std::vector<std::vector<uint32_t>> ByMaterial(Materials.size());
    for (uint32_t T = 0; T < Triangles.size(); ++T)
    {
        uint32_t Which = 0u;
        std::memcpy(&Which, &Triangles[T].MaterialSlot, sizeof(uint32_t));
        if (Which < ByMaterial.size()) ByMaterial[Which].push_back(T);
    }

    Matrix4x4 Identity;
    uint32_t Registered = 0u;
    for (size_t M = 0; M < ByMaterial.size(); ++M)
    {
        if (ByMaterial[M].empty()) continue;
        GeometryStructure Mesh;
        std::vector<VertexRecord> Corners;
        std::vector<uint32_t>     Order;
        Corners.reserve(ByMaterial[M].size() * 3u);
        Order.reserve(ByMaterial[M].size() * 3u);
        for (uint32_t T : ByMaterial[M])
        {
            const TriangleIndex& Tri = Triangles[T];
            const float Position[3][3] = {
                { Tri.VertexAlphaX, Tri.VertexAlphaY, Tri.VertexAlphaZ },
                { Tri.VertexBetaX,  Tri.VertexBetaY,  Tri.VertexBetaZ  },
                { Tri.VertexGammaX, Tri.VertexGammaY, Tri.VertexGammaZ } };
            const float Texture[3][2] = {
                { Tri.TextureAlphaU, Tri.TextureAlphaV },
                { Tri.TextureBetaU,  Tri.TextureBetaV  },
                { Tri.TextureGammaU, Tri.TextureGammaV } };
            for (unsigned K = 0; K < 3u; ++K)
            {
                VertexRecord V{};
                V.SpatialLocation  = { Position[K][0], Position[K][1], Position[K][2] };
                const Vector3 N    = (static_cast<size_t>(T) * 3u + K) < CornerNormal.size()
                                   ? CornerNormal[static_cast<size_t>(T) * 3u + K] : Vector3{ 0.0f, 0.0f, 1.0f };
                V.NormalDirection  = N;
                V.TextureCoordinateU = Texture[K][0];
                V.TextureCoordinateV = Texture[K][1];
                Order.push_back(static_cast<uint32_t>(Corners.size()));
                Corners.push_back(V);
            }
        }
        Mesh.AppendVertices(Corners.data(), Corners.size());
        Mesh.AppendIndices(Order.data(), Order.size());
        const uint32_t First = Level.RegisterInstance(Mesh, Identity, Slot[M], 0u);
        const uint32_t Place = Level.RegisterPlacement(Materials[M].Name.empty() ? "Showcase" : Materials[M].Name,
                                                       0xFFFFFFFFu, Identity, Identity);
        Level.AttachInstances(Place, First, 1u);
        ++Registered;
    }
    // ── the instanced grid ──────────────────────────────────────────────────────────────────────────────────
    // Showcase revision 7 stops flattening the grid balls into Triangles and publishes them as placements over
    //    shared geometry instead. One RegisterTopology for the whole 20×20 grid, then one PlaceTopology per
    //    slot: 380 placements over ONE copy of the 67 832-triangle mesh. Registering per placement instead
    //    would be 380 copies of 1.9 MB.
    //
    //    ⚠️ A placement is several InstanceRecords, not one — the 8 192-triangle span limit cuts the ball into
    //    9 of them. PlaceTopology returns the FIRST; the count comes from QueryTopologyPartitions.
    const auto& Geometry   = Showcase.QueryGridGeometry();
    const auto& Placements = Showcase.QueryGridPlacements();
    std::vector<uint32_t> Topology(Geometry.size(), 0u);
    for (size_t G = 0u; G < Geometry.size(); ++G)
    {
        GeometryStructure Mesh;
        if (Geometry[G].Vertices == nullptr || Geometry[G].Indices == nullptr) continue;
        Mesh.AppendVertices(Geometry[G].Vertices->data(), Geometry[G].Vertices->size());
        Mesh.AppendIndices(Geometry[G].Indices->data(), Geometry[G].Indices->size());
        Topology[G] = Level.RegisterTopology(Mesh);
    }
    for (const InstancedPlacementRecord& P : Placements)
    {
        if (P.Geometry >= Topology.size()) continue;
        Matrix4x4 World;
        std::memcpy(&World.Columns[0][0], P.World, sizeof(float) * 16u);
        const uint32_t Slab  = P.Material < Slot.size() ? Slot[P.Material] : 0u;
        const uint32_t First = Level.PlaceTopology(Topology[P.Geometry], World, Slab, 0u);
        const uint32_t Count = Level.QueryTopologyPartitions(Topology[P.Geometry]);
        const uint32_t Place = Level.RegisterPlacement(P.Name.empty() ? "GridBall" : P.Name,
                                                       0xFFFFFFFFu, World, World);
        Level.AttachInstances(Place, First, Count);
        ++Registered;
    }

    Level.AssignName("Showcase");
    Level.Finalise();
    return Registered;
}

// ── The framings, verbatim from the product ────────────────────────────────────────────────────────────────────────
// These are Projects/Project-Zero/Host/MaterialLevelViewport.cpp's `ShowcaseViewpointFor` entries, which are in turn
//    GameExecution.cpp's "Showcase" branch: the position, pitch, yaw and FoV the application itself opens with.
//    Copied rather than derived so the raster sheet and the ReSTIR sheet are provably the SAME shot.
struct Viewpoint { float X, Y, Z, PitchDegrees, YawDegrees, FieldOfView; };

Viewpoint ShowcaseViewpointFor(const std::string& Name)
{
    if (Name == "grid400") return {   0.0f,  -9.00f, 42.00f, -62.0f,  0.0f, 44.0f };   // the whole 400 from above
    if (Name == "grid")    return {   0.0f,  -9.50f,  4.20f, -10.0f,  0.0f, 55.0f };   // closer on the front rows
    if (Name == "metals")  return {  -1.0f,  -5.40f,  1.60f,  -7.0f,  0.0f, 50.0f };   // row 0: anisotropic metals
    if (Name == "glass")   return {  -1.0f,  -3.90f,  1.60f,  -6.0f,  0.0f, 50.0f };   // row 1: the IOR ramp
    if (Name == "wide")    return {   0.0f, -22.00f, 11.00f, -18.0f,  0.0f, 62.0f };   // grid + the scattered ring
    if (Name == "panel")   return {  2.35f,  -5.60f,  1.35f,  -4.0f,  8.0f, 42.0f };   // the interface panel, close
    if (Name == "glints")  return {  -1.0f,  12.70f,  1.60f,  -7.0f,  0.0f, 50.0f };   // row 12: the glint ramp
    // r7: all five automotive families live on ROW 15, four contiguous columns each (4f .. 4f+3), sweeping the
    //    family's parameter 0 → 1 inside the block. Before r7 each family owned a whole row (15 + f) and these
    //    cameras stood at the end of it looking along +X. Now they look BROADSIDE at one four-ball block.
    const char* PaintViews[5] = { "paint-candy", "paint-glitter", "paint-iridescent", "paint-cobalt", "paint-copper" };
    for (int Family = 0; Family < 5; ++Family)
    {
        const float RowY   = -1.8f + 1.5f * 15.0f;
        const float BlockX = -14.25f + 1.5f * (4.0f * static_cast<float>(Family) + 1.5f);
        if (Name == PaintViews[Family])                            return { BlockX, RowY - 4.60f, 1.55f, -11.0f, 0.0f, 46.0f };
        if (Name == std::string(PaintViews[Family]) + "-macro")     return { BlockX - 2.25f, RowY - 1.55f, 0.60f, 0.0f, 0.0f, 40.0f };
    }
    return { 0.0f, -15.00f, 8.00f, -21.0f, 0.0f, 55.0f };                               // the product's entry shot
}

} // namespace

int main(int ArgumentCount, char** ArgumentValues)
{
    std::string OutPath = "Showcase_VisibilityRaster.png";
    std::string View = "default";
    uint32_t Width = 960u, Height = 540u;
    float SunHour = 15.0f;

    for (int I = 1; I < ArgumentCount; ++I)
    {
        const std::string A = ArgumentValues[I];
        auto Next = [&](const char* What) -> const char* {
            if (I + 1 >= ArgumentCount) { std::fprintf(stderr, "%s needs a value\n", What); std::exit(2); }
            return ArgumentValues[++I]; };
        if      (A == "--out")    OutPath = Next("--out");
        else if (A == "--width")  Width   = static_cast<uint32_t>(std::atoi(Next("--width")));
        else if (A == "--height") Height  = static_cast<uint32_t>(std::atoi(Next("--height")));
        else if (A == "--sun")    SunHour = static_cast<float>(std::atof(Next("--sun")));
        else if (A == "--view")   View    = Next("--view");
        else { std::fprintf(stderr, "unknown argument %s\n", A.c_str()); return 2; }
    }

    std::printf("================================================================================\n");
    std::printf("  PROJECT-ZERO SHOWCASE — VISIBILITY RASTER (RT OFF, GI OFF), ENGINE CPU RENDER  \n");
    std::printf("================================================================================\n");

    // 1 ── the authored level, straight from the engine
    ShowcaseStructure Showcase;
    Showcase.Construct();
    Check(kShowcaseGridSide == 20u, "the default level is the 20 x 20 material grid");
    Check(kShowcaseRevision == 7u,  "the level is the current r7 revision");
    Check(!Showcase.QueryTriangles().empty(), "ShowcaseStructure produced geometry");

    auto Level = std::make_unique<SceneStructure>();
    const uint32_t Meshes = BuildLevel(*Level, Showcase);
    std::printf("[showcase-raster] level: %u triangles, %zu materials, %u registered meshes\n",
                Level->QueryTriangleCount(), Showcase.QueryMaterials().size(), Meshes);
    Check(Level->QueryTriangleCount() > 0u, "the level registered into SceneStructure");
    Check(!Level->QueryLuminaires().empty(), "the level carries emissive luminaires");

    // 3 ── the real sky: the engine's own celestial model, not a gradient authored here
    // 2 ── the product's own camera for this framing, posed by the engine's own CameraProjection
    const Viewpoint VP = ShowcaseViewpointFor(View);
    const float Eye[3] = { VP.X, VP.Y, VP.Z };
    constexpr float kPi = 3.14159265358979f;
    CameraProjection Camera;
    Camera.AssignSpatialLocation({ VP.X, VP.Y, VP.Z });
    Camera.AssignOrientationEuler(VP.PitchDegrees * kPi / 180.0f, VP.YawDegrees * kPi / 180.0f, 0.0f);
    Camera.AssignFieldOfView(VP.FieldOfView);
    Camera.AssignAspectRatio(static_cast<float>(Width) / static_cast<float>(Height));

    auto Sky = std::make_unique<CelestialSequence>();
    Sky->Prepare();
    Sky->Observation.LocalHours = SunHour;
    // The celestial bodies are shown; the weather volumes stay at their authored default (off), which is the
    //    "clear" staging every other showcase sheet in this repository is rendered under.  Shown[] defaults to
    //    all-false, and a hidden Sun is night to the raster — so these five are the sky the product presents.
    for (auto Entity : { CelestialEntity::Atmosphere, CelestialEntity::Sun, CelestialEntity::Sky,
                         CelestialEntity::Stars,      CelestialEntity::Moons })
        Sky->Shown[static_cast<uint32_t>(Entity)] = true;
    CelestialBudget Budget;
    Budget.AtmosphereSamples = 16u;
    Budget.AtmosphereLightSamples = 6u;
    Sky->Tick(0.0f, Eye, 0.0f);

    auto Raster = std::make_unique<VisibilityRaster>();
    Sky->ApplyTo(*Raster, Budget);
    Check(Raster->QueryCelestial().Enabled, "the engine's celestial model reached the raster");

    // 4 ── render through the shipped visibility raster
    const Vector3 F = Camera.QueryForwardVector(), R = Camera.QueryRightVector(), U = Camera.QueryUpwardVector();
    const float Forward[3] = { F.x, F.y, F.z }, Right[3] = { R.x, R.y, R.z }, Up[3] = { U.x, U.y, U.z };
    std::vector<unsigned char> Pixels(static_cast<size_t>(Width) * Height * 4u);
    double MeanLuminance = 0.0;
    Check(Raster->Render(*Level, Eye, Forward, Right, Up, Camera.QueryFieldOfViewRadians(),
                         Width, Height, Pixels.data(), MeanLuminance),
          "Engine/GeometricRaster/VisibilityRaster rendered the level");

    std::printf("[showcase-raster] view '%s': eye (%.2f %.2f %.2f), pitch %.1f deg, yaw %.1f deg, FoV %.1f, %ux%u\n",
                View.c_str(), static_cast<double>(VP.X), static_cast<double>(VP.Y), static_cast<double>(VP.Z),
                static_cast<double>(VP.PitchDegrees), static_cast<double>(VP.YawDegrees),
                static_cast<double>(VP.FieldOfView), Width, Height);
    std::printf("[showcase-raster] sun hour %.2f, mean luminance %.4f\n",
                static_cast<double>(SunHour), MeanLuminance);

    unsigned long long Lit = 0ull;
    for (size_t I = 0; I + 3 < Pixels.size(); I += 4)
        if (Pixels[I] > 8u || Pixels[I + 1] > 8u || Pixels[I + 2] > 8u) ++Lit;
    Check(Lit * 20ull > static_cast<unsigned long long>(Width) * Height,
          "the frame is not a black plate (>5 % of pixels carry light)");
    Check(MeanLuminance > 0.0, "the raster reported a positive mean luminance");

    std::vector<unsigned char> Rgb(static_cast<size_t>(Width) * Height * 3u);
    for (size_t I = 0, O = 0; I + 3 < Pixels.size(); I += 4, O += 3)
    { Rgb[O] = Pixels[I]; Rgb[O + 1] = Pixels[I + 1]; Rgb[O + 2] = Pixels[I + 2]; }
    Check(stbi_write_png(OutPath.c_str(), static_cast<int>(Width), static_cast<int>(Height), 3,
                         Rgb.data(), static_cast<int>(Width) * 3) != 0, "wrote the sheet");
    std::printf("[showcase-raster] wrote -> %s  (%u gates passed)\n", OutPath.c_str(), g_Checks);
    return 0;
}
