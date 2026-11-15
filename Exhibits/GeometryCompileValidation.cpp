/*============================================================================================================================================
                                                        GEOMETRYCOMPILEVALIDATION.CPP
============================================================================================================================================*/
// 🧩 G2 gate: headless GeometryCompileSession (units, weld, normals, collision fits, downstream invalidation, 8-slot vehicle body)

//------------------------------------------------------------------------------------------------------------------------
//                                                        INCLUDES
//------------------------------------------------------------------------------------------------------------------------

#include "Engine/GeometrySpace/Primitives/AnalyticPrimitives.h"
#include "Engine/Interchange/GeometryInterchange.h"
#include "Engine/Workspaces/Geometry/GeometryCompileSession.h"
#include "Exhibits/GeometryCompileExhibitStudio.h"

#include <array>
#include <cmath>
#include <cstdio>
#include <map>
#include <string>
#include <vector>

namespace
{

using namespace Frontier;
using Interchange::ExternalGeometryFormat;
using Interchange::GeometryInterchange;
using SimulationSpace::PhysicsSpace::CollisionShapeCategory;
using SimulationSpace::PhysicsSpace::CollisionShapeFit;
using Workspaces::CompileStepCategory;
using Workspaces::CompileStepStatus;
using Workspaces::GeometryCompileSession;

constexpr std::string_view CubeObjText =
    "# cube\nv -1 -1 -1\nv 1 -1 -1\nv 1 1 -1\nv -1 1 -1\nv -1 -1 1\nv 1 -1 1\nv 1 1 1\nv -1 1 1\n"
    "usemtl a\nf 1 4 3 2\nf 5 6 7 8\nusemtl b\nf 1 2 6 5\nf 2 3 7 6\nf 3 4 8 7\nf 4 1 5 8\n";

[[nodiscard]] bool Near(float Measured, float Expected, float Tolerance) noexcept
{
    return std::fabs(Measured - Expected) <= Tolerance;
}

[[nodiscard]] GeometrySpace::ConstructedSampleAsset ImportCube()
{
    GeometrySpace::ConstructedSampleAsset Cube {};
    std::string Diag;
    (void)GeometryInterchange::ImportWavefrontObjText(CubeObjText, "Cube", Cube, Diag);
    return Cube;
}

[[nodiscard]] bool CornerNormalsAxisAligned(const std::vector<Mathematics::Axis3D>& Normals) noexcept
{
    for (const Mathematics::Axis3D N : Normals)
    {
        const float Dominant = std::max({ std::fabs(N.X), std::fabs(N.Y), std::fabs(N.Z) });
        if (!Near(Dominant, 1.0f, 1.0e-5f))
        {
            return false;
        }
    }
    return !Normals.empty();
}

[[nodiscard]] std::string JoinSteps(const std::vector<CompileStepCategory>& Steps)
{
    std::string Joined;
    for (const CompileStepCategory Step : Steps)
    {
        Joined += (Joined.empty() ? "" : ", ") + std::string(Workspaces::InspectCompileStepDescriptor(Step).Title);
    }
    return Joined.empty() ? std::string("none") : Joined;
}

using StatusSnapshot = std::array<CompileStepStatus, Workspaces::CompileStepCount>;

[[nodiscard]] StatusSnapshot CaptureStatuses(const GeometryCompileSession& Session)
{
    StatusSnapshot Snapshot {};
    for (std::size_t Idx = 0u; Idx < Workspaces::CompileStepCount; ++Idx)
    {
        Snapshot[Idx] = Session.InspectStepReport(static_cast<CompileStepCategory>(Idx)).Status;
    }
    return Snapshot;
}

[[nodiscard]] ImU32 QueryStatusColour(CompileStepStatus Status) noexcept
{
    switch (Status)
    {
        case CompileStepStatus::Stale:    return IM_COL32(235, 190, 96, 255);
        case CompileStepStatus::Compiled: return IM_COL32(126, 214, 150, 255);
        case CompileStepStatus::Disabled: return IM_COL32(92, 100, 114, 255);
        case CompileStepStatus::Failed:   return IM_COL32(240, 104, 104, 255);
        case CompileStepStatus::Deferred: return IM_COL32(116, 140, 178, 255);
    }
    return IM_COL32(255, 255, 255, 255);
}

[[nodiscard]] const char* QueryStatusTitle(CompileStepStatus Status) noexcept
{
    switch (Status)
    {
        case CompileStepStatus::Stale:    return "stale";
        case CompileStepStatus::Compiled: return "compiled";
        case CompileStepStatus::Disabled: return "off";
        case CompileStepStatus::Failed:   return "failed";
        case CompileStepStatus::Deferred: return "deferred";
    }
    return "?";
}

// Display-only remap: one tinted layer per FCT1 slot code so the 8 material slots read in the Vulkan tile.
void RemapSlotsToDisplayLayers(GeometrySpace::PolygonNetwork& Network, std::vector<GeometrySpace::PriorityAllocationLayer>& OutLayers)
{
    constexpr std::array<Mathematics::Scalar3D, 10u> SlotTints {{
        { 0.30f, 0.52f, 0.86f }, { 0.62f, 0.84f, 0.92f }, { 0.36f, 0.36f, 0.40f }, { 0.16f, 0.16f, 0.18f }, { 0.78f, 0.78f, 0.80f },
        { 0.86f, 0.36f, 0.30f }, { 0.70f, 0.66f, 0.56f }, { 0.98f, 0.94f, 0.66f }, { 0.92f, 0.20f, 0.24f }, { 0.58f, 0.46f, 0.78f },
    }};
    std::map<uint16_t, uint16_t> SlotToLayer {};
    for (GeometrySpace::Face& CurrentFace : Network.Faces)
    {
        auto [Found, Inserted] = SlotToLayer.emplace(CurrentFace.PartGroupOrdinal, static_cast<uint16_t>(SlotToLayer.size() + 1u));
        CurrentFace.PriorityLayerOrdinal = Found->second;
        if (Inserted)
        {
            GeometrySpace::PriorityAllocationLayer Layer {};
            Layer.LayerOrdinal  = Found->second;
            Layer.LayerTitle    = std::string(GeometryInterchange::QueryFct1SlotTitle(CurrentFace.PartGroupOrdinal));
            Layer.LinearTintRGB = SlotTints[(CurrentFace.PartGroupOrdinal >= 6u ? CurrentFace.PartGroupOrdinal - 6u : 0u) % SlotTints.size()];
            OutLayers.push_back(Layer);
        }
    }
    ++Network.ShadingRevision;
}

// Orthographic exhibit diagram: body vertices as dots plus the fitted proxy outline (axes A horizontal, B vertical).
void TraceCollisionDiagram(
    ImDrawList* List, ImVec2 Min, ImVec2 Max, const std::vector<Mathematics::Axis3D>& Points,
    const CollisionShapeFit& Shape, int AxisA, int AxisB, const char* Caption)
{
    const auto Component = [](Mathematics::Axis3D P, int Axis) { return Axis == 0 ? P.X : (Axis == 1 ? P.Y : P.Z); };
    List->AddRectFilled(Min, Max, IM_COL32(22, 26, 34, 255), 6.0f);
    List->AddText(ImVec2(Min.x + 10.0f, Min.y + 8.0f), IM_COL32(200, 208, 220, 255), Caption);

    const float Reach = std::max({ Shape.HalfExtents.X, Shape.HalfExtents.Y, Shape.HalfExtents.Z, Shape.Radius + Shape.HalfHeight }) * 1.12f;
    const float Scale = std::min(Max.x - Min.x, Max.y - Min.y - 30.0f) * 0.5f / std::max(1.0e-3f, Reach);
    const ImVec2 Centre { (Min.x + Max.x) * 0.5f, (Min.y + Max.y) * 0.5f + 12.0f };
    const auto Project = [&](float A, float B)
    {
        return ImVec2(Centre.x + (A - Component(Shape.Centre, AxisA)) * Scale, Centre.y - (B - Component(Shape.Centre, AxisB)) * Scale);
    };

    for (const Mathematics::Axis3D P : Points)
    {
        List->AddCircleFilled(Project(Component(P, AxisA), Component(P, AxisB)), 1.2f, IM_COL32(150, 170, 200, 150), 4);
    }

    const ImU32 Outline = IM_COL32(126, 214, 150, 255);
    const float Ca = Component(Shape.Centre, AxisA), Cb = Component(Shape.Centre, AxisB);
    switch (Shape.Category)
    {
        case CollisionShapeCategory::Box:
        {
            const float Ha = Component(Shape.HalfExtents, AxisA), Hb = Component(Shape.HalfExtents, AxisB);
            List->AddRect(Project(Ca - Ha, Cb + Hb), Project(Ca + Ha, Cb - Hb), Outline, 0.0f, 0, 2.0f);
            break;
        }
        case CollisionShapeCategory::Sphere:
            List->AddCircle(Project(Ca, Cb), Shape.Radius * Scale, Outline, 96, 2.0f);
            break;
        case CollisionShapeCategory::Capsule:
        {
            const int   Axis = Shape.AxisOrdinal;
            const float H    = Shape.HalfHeight, R = Shape.Radius;
            if (Axis == AxisA || Axis == AxisB)
            {
                const bool  Horizontal = (Axis == AxisA);
                const ImVec2 EndA = Horizontal ? Project(Ca - H, Cb) : Project(Ca, Cb - H);
                const ImVec2 EndB = Horizontal ? Project(Ca + H, Cb) : Project(Ca, Cb + H);
                const float  Rpx  = R * Scale;
                const float  π    = 3.14159265f;
                if (Horizontal)
                {
                    List->AddLine(ImVec2(EndA.x, EndA.y - Rpx), ImVec2(EndB.x, EndB.y - Rpx), Outline, 2.0f);
                    List->AddLine(ImVec2(EndA.x, EndA.y + Rpx), ImVec2(EndB.x, EndB.y + Rpx), Outline, 2.0f);
                    List->PathArcTo(EndB, Rpx, -0.5f * π, 0.5f * π, 32); List->PathStroke(Outline, 0, 2.0f);
                    List->PathArcTo(EndA, Rpx, 0.5f * π, 1.5f * π, 32);  List->PathStroke(Outline, 0, 2.0f);
                }
                else
                {
                    List->AddLine(ImVec2(EndA.x - Rpx, EndA.y), ImVec2(EndB.x - Rpx, EndB.y), Outline, 2.0f);
                    List->AddLine(ImVec2(EndA.x + Rpx, EndA.y), ImVec2(EndB.x + Rpx, EndB.y), Outline, 2.0f);
                    List->PathArcTo(EndB, Rpx, π, 2.0f * π, 32); List->PathStroke(Outline, 0, 2.0f);
                    List->PathArcTo(EndA, Rpx, 0.0f, π, 32);     List->PathStroke(Outline, 0, 2.0f);
                }
            }
            else
            {
                List->AddCircle(Project(Ca, Cb), R * Scale, Outline, 96, 2.0f);
            }
            break;
        }
        case CollisionShapeCategory::None:
            break;
    }
}

} // namespace

//------------------------------------------------------------------------------------------------------------------------
//                                                      ENTRY POINT
//------------------------------------------------------------------------------------------------------------------------

int main()
{
    const std::filesystem::path RepoRoot = Exhibits::ResolveRepositoryRootPath();
    const std::filesystem::path BodyPath = RepoRoot / "EngineContent/EnvironmentArchives/ControlVehicle/ControlVehicleBody.face";
    Exhibits::ExhibitScoreboard Score {};
    Score.SuiteTitle = "GeometryCompileValidation";

    // ④ Units + up axis: FCT1 body is authored Z-up (engine basis); length 6.22 m on X, 1.46 m tall on Z, 2.50 m wide on Y
    {
        GeometryCompileSession Meters {};
        std::string Diag;
        Score.Check(Meters.LoadSourceFile(BodyPath, Diag), "LoadSourceFile ControlVehicleBody.face " + Diag);
        Meters.AccessDirectives().Source.UpAxis = Workspaces::SourceUpAxis::ZUp;
        (void)Meters.RunStep(CompileStepCategory::Source);
        const auto Size = Meters.InspectSourceOutput().Bounds.QuerySize();
        char Line[160] {};
        std::snprintf(Line, sizeof(Line), "Units m: body %.4f x %.4f x %.4f (length x width x height)", Size.X, Size.Y, Size.Z);
        Score.Check(Near(Size.X, 6.2202f, 1.0e-3f) && Near(Size.Z, 1.4574f, 1.0e-3f) && Near(Size.Y, 2.4996f, 1.0e-3f), Line);

        GeometryCompileSession Centimeters {};
        (void)Centimeters.LoadSourceFile(BodyPath, Diag);
        Centimeters.AccessDirectives().Source.Unit = Workspaces::SourceLengthUnit::Centimeters;
        (void)Centimeters.RunStep(CompileStepCategory::Source);
        std::snprintf(Line, sizeof(Line), "Units cm: body length %.6f m", Centimeters.InspectSourceOutput().Bounds.QuerySize().X);
        Score.Check(Near(Centimeters.InspectSourceOutput().Bounds.QuerySize().X, 0.062202f, 1.0e-5f), Line);

        GeometryCompileSession Reinterpreted {};
        (void)Reinterpreted.LoadSourceFile(BodyPath, Diag);
        Reinterpreted.AccessDirectives().Source.UpAxis = Workspaces::SourceUpAxis::YUp;
        (void)Reinterpreted.RunStep(CompileStepCategory::Source);
        Score.Check(Near(Reinterpreted.InspectSourceOutput().Bounds.QuerySize().Z, 2.4996f, 1.0e-3f), "Up axis override Y-up re-bases the body (width becomes height)");
    }

    // ⑤ Weld: the OBJ cube is closed with one part; a loose quad merges only exact duplicates at 0 and the 0.4 mm gap at 1 mm
    {
        GeometryCompileSession CubeSession {};
        CubeSession.AssignSourceAsset(ImportCube(), ExternalGeometryFormat::WavefrontObj, "Cube");
        (void)CubeSession.RunStep(CompileStepCategory::Source);
        const auto& Audit = CubeSession.InspectSourceOutput().Audit;
        Score.Check(Audit.OpenBoundaryEdgeCount == 0u && Audit.NonManifoldEdgeCount == 0u && Audit.PartCount == 1u,
                    "Welded cube: 0 open edges, 0 non-manifold, 1 part -> \"" + CubeSession.InspectStepReport(CompileStepCategory::Source).Summary + "\"");

        GeometrySpace::ConstructedSampleAsset Quad {};
        const std::array<Mathematics::Axis3D, 6u> Corners {{ { 0, 0, 0 }, { 1, 0, 0 }, { 1, 1, 0 }, { 0, 0, 0 }, { 1, 1.0004f, 0 }, { 0, 1, 0 } }};
        for (const auto& P : Corners) { (void)Quad.Network.AppendVertex(P); }
        const std::array<uint32_t, 3u> TriA {{ 0u, 1u, 2u }}, TriB {{ 3u, 4u, 5u }};
        const std::array<Mathematics::UVAxes, 3u> UVs {{ { 0, 0 }, { 1, 0 }, { 1, 1 } }};
        (void)Quad.Network.AppendFace(TriA, UVs, {}, 0u, 0u);
        (void)Quad.Network.AppendFace(TriB, UVs, {}, 0u, 0u);
        Quad.Network.LinkOppositeEdges(false);
        Quad.Network.RecomputeNormals();

        GeometryCompileSession Loose {};
        Loose.AssignSourceAsset(Quad, ExternalGeometryFormat::Stl, "Quad");
        (void)Loose.RunStep(CompileStepCategory::Source);
        const std::size_t AtZero = Loose.InspectSourceOutput().Network.Vertices.size();
        Loose.AccessDirectives().Source.WeldToleranceMeters = 0.001f;
        Loose.InvalidateStep(CompileStepCategory::Source);
        (void)Loose.RunStep(CompileStepCategory::Source);
        const std::size_t AtMillimeter = Loose.InspectSourceOutput().Network.Vertices.size();
        Score.Check(AtZero == 5u && AtMillimeter == 4u,
                    "Loose quad: " + std::to_string(AtZero) + " verts at weld 0, " + std::to_string(AtMillimeter) + " at weld 1 mm");
    }

    // ⑥ Corner normals: flat and 40° angle split keep cube corners axis aligned; smooth blends across the corner
    {
        bool FlatAligned = false, AngleAligned = false, SmoothBlends = false;
        for (const auto Mode : { Workspaces::CornerNormalMode::Flat, Workspaces::CornerNormalMode::AngleSplit, Workspaces::CornerNormalMode::Smooth })
        {
            GeometryCompileSession CubeSession {};
            CubeSession.AssignSourceAsset(ImportCube(), ExternalGeometryFormat::WavefrontObj, "Cube");
            CubeSession.AccessDirectives().Geometry.Normals = Mode;
            (void)CubeSession.RunStep(CompileStepCategory::Geometry);
            const auto& Normals = CubeSession.InspectGeometryOutput().CornerNormals;
            if (Mode == Workspaces::CornerNormalMode::Flat)       { FlatAligned  = CornerNormalsAxisAligned(Normals); }
            if (Mode == Workspaces::CornerNormalMode::AngleSplit) { AngleAligned = CornerNormalsAxisAligned(Normals); }
            if (Mode == Workspaces::CornerNormalMode::Smooth)     { SmoothBlends = !Normals.empty() && std::fabs(std::fabs(Normals[0].X) - 1.0f) > 0.1f; }
        }
        Score.Check(FlatAligned, "Flat corner normals axis aligned (face GeometricNormal)");
        Score.Check(AngleAligned, "40 deg angle split keeps cube edges hard (MarkDihedralSharpSeams + EvaluateCreaseCornerNormals)");
        Score.Check(SmoothBlends, "Smooth normals blend across the corner (RecomputeNormals)");
    }

    // ⑦ Collision fits on the reference points
    {
        const std::array<Mathematics::Axis3D, 4u> Points {{ { -2.0f, -0.5f, -0.5f }, { 2.0f, 0.5f, 0.5f }, { 0.0f, 0.0f, 0.0f }, { 1.0f, -0.3f, 0.2f } }};
        const auto Box     = SimulationSpace::PhysicsSpace::FitCollisionShape(Points, CollisionShapeCategory::Box);
        const auto Sphere  = SimulationSpace::PhysicsSpace::FitCollisionShape(Points, CollisionShapeCategory::Sphere);
        const auto Capsule = SimulationSpace::PhysicsSpace::FitCollisionShape(Points, CollisionShapeCategory::Capsule);
        Score.Check(Box.HalfExtents.X == 2.0f && Box.HalfExtents.Y == 0.5f && Box.HalfExtents.Z == 0.5f, "Box fit: half extents = [2, 0.5, 0.5]");
        bool Encloses = true;
        for (const auto& P : Points) { Encloses = Encloses && Mathematics::EvaluateDistance(P, Sphere.Centre) <= Sphere.Radius + 1.0e-6f; }
        Score.Check(Encloses, "Ritter sphere encloses every point");
        Score.Check(Capsule.AxisOrdinal == 0u && Capsule.HalfHeight > 0.0f, "Capsule runs along the long X axis with a cylinder section");
    }

    // ⑧ Step sequence on a torus: full compile, floor pivot, uv-only and geometry-downstream invalidation, lod off, name required
    StatusSnapshot AfterCompile {}, AfterUV {}, AfterGeometry {}, AfterLodOff {};
    {
        GeometrySpace::ConstructedSampleAsset Torus {};
        GeometrySpace::AppendTorusRingPrimitive(Torus.Network, { 0.0f, 0.0f, 0.0f }, 1.0f, 0.35f, 48u, 24u, {}, {});
        Torus.Network.LinkOppositeEdges(false);
        Torus.Network.RecomputeNormals();

        GeometryCompileSession Session {};
        Session.AssignSourceAsset(Torus, ExternalGeometryFormat::Unknown, "Torus");
        Score.Check(Session.CompileAll() && Session.QueryFullyCompiled(), "Torus compiles end to end (UV / SDF / LOD / icon report deferred)");
        AfterCompile = CaptureStatuses(Session);
        Score.Check(std::fabs(Session.InspectGeometryOutput().Bounds.Minimum.Z) < 1.0e-6f, "Floor pivot puts the lowest point at Z = 0");

        const uint32_t GeometryRuns = Session.InspectStepReport(CompileStepCategory::Geometry).RunCount;
        Session.InvalidateStep(CompileStepCategory::UV);
        AfterUV = CaptureStatuses(Session);
        Score.Check(JoinSteps(Session.QueryStaleSteps()) == "UV Charts", "Invalidate UV -> stale: " + JoinSteps(Session.QueryStaleSteps()));
        (void)Session.CompileAll();
        Score.Check(Session.InspectStepReport(CompileStepCategory::Geometry).RunCount == GeometryRuns, "Recompile after UV edit leaves Geometry untouched");

        Session.InvalidateStep(CompileStepCategory::Geometry);
        AfterGeometry = CaptureStatuses(Session);
        Score.Check(JoinSteps(Session.QueryStaleSteps()) == "Geometry, UV Charts, SDF Bake, Cluster LOD, Collision, Icon Bake",
                    "Invalidate Geometry -> stale: " + JoinSteps(Session.QueryStaleSteps()));

        Session.AccessDirectives().Lod.Enabled = false;
        Session.InvalidateStep(CompileStepCategory::Lod);
        (void)Session.CompileAll();
        AfterLodOff = CaptureStatuses(Session);
        Score.Check(Session.InspectStepReport(CompileStepCategory::Lod).Status == CompileStepStatus::Disabled, "LOD disabled -> step off");

        Session.AccessDirectives().Meta.Title = "   ";
        Session.InvalidateStep(CompileStepCategory::Meta);
        (void)Session.CompileAll();
        Score.Check(Session.InspectStepReport(CompileStepCategory::Meta).Diagnostic == "Name is required", "Empty title -> \"Name is required\"");
    }

    // ⑨ Vehicle body: authored pivot kept (centre none), low Z -0.10586, 8 material slots from FCT1 slot codes
    GeometryCompileSession Vehicle {};
    {
        std::string Diag;
        (void)Vehicle.LoadSourceFile(BodyPath, Diag);
        auto& Directives = Vehicle.AccessDirectives();
        Directives.Source.UpAxis   = Workspaces::SourceUpAxis::ZUp;
        Directives.Geometry.Pivot  = Workspaces::PivotPlacement::None;
        Directives.SDF.Enabled     = false;
        Directives.Lod.Enabled     = false;
        Vehicle.InvalidateStep(CompileStepCategory::Source);
        Vehicle.InvalidateStep(CompileStepCategory::Meta);
        Directives.Meta.Tags       = "vehicle, control";
        Score.Check(Vehicle.CompileAll() && Vehicle.QueryFullyCompiled(), "Vehicle body compiles");
        char Line[128] {};
        std::snprintf(Line, sizeof(Line), "Vehicle body low Z = %.5f (authored pivot kept)", Vehicle.InspectGeometryOutput().Bounds.Minimum.Z);
        Score.Check(Near(Vehicle.InspectGeometryOutput().Bounds.Minimum.Z, -0.10586f, 1.0e-4f), Line);
        Score.Check(Vehicle.InspectGeometryOutput().SlotCount == 8u, "Vehicle body keeps 8 material slots (" + std::to_string(Vehicle.InspectGeometryOutput().SlotCount) + ")");
    }

    // 🎨 Proofs ---------------------------------------------------------------------------------------------------------
    constexpr uint32_t CanvasW = 1800u, CanvasH = 1000u;
    Exhibits::GeometryCompileExhibitStudio Studio {};
    std::string StudioDiag;
    if (!Score.Check(Studio.Initialize(RepoRoot, CanvasW, CanvasH, StudioDiag), "Vulkan UVWorkspaceRasterizer ready " + StudioDiag))
    {
        return 1;
    }

    GeometrySpace::PolygonNetwork                       SlotNetwork = Vehicle.InspectGeometryOutput().Network;
    std::vector<GeometrySpace::PriorityAllocationLayer> SlotLayers  {};
    RemapSlotsToDisplayLayers(SlotNetwork, SlotLayers);

    // 02 — step timeline
    {
        std::vector<Exhibits::GeometryCompileExhibitStudio::PendingTileBlit> Blits(1u);
        Blits[0].X = 1180u; Blits[0].Y = 110u; Blits[0].Width = 590u; Blits[0].Height = 420u;
        Score.Check(Studio.RenderNetworkTile(SlotNetwork, SlotLayers, GeometricRaster::SurfaceDisplayMode::PriorityLayerTint,
                                             Blits[0].Width, Blits[0].Height, Blits[0].Rgba, 0.85f, 0.36f), "Vehicle body (8 slots) rendered on Vulkan");

        ImDrawList* List  = Studio.BeginLabelCanvas();
        const ImU32 Title = IM_COL32(236, 239, 244, 255);
        const ImU32 Muted = IM_COL32(150, 162, 182, 255);
        const ImU32 Panel = IM_COL32(25, 30, 39, 255);
        List->AddText(ImVec2(30.0f, 24.0f), Title, "G2 - GeometryCompileSession step sequence (Engine/Workspaces/Geometry) on ControlVehicleBody.face");
        List->AddText(ImVec2(30.0f, 50.0f), Muted, "source -> geometry -> { uv, sdf, lod, collision, icon }   meta stands alone.  UV / SDF / LOD / icon runners land in G3 / G4 and report deferred.");

        List->AddRectFilled(ImVec2(24.0f, 86.0f), ImVec2(1150.0f, 540.0f), Panel, 8.0f);
        const std::array<float, 6u> Columns {{ 44.0f, 220.0f, 330.0f, 870.0f, 980.0f, 1060.0f }};
        const std::array<const char*, 6u> Headers {{ "Step", "Status", "Summary", "Time", "Runs", "" }};
        for (std::size_t Col = 0u; Col < 5u; ++Col) { List->AddText(ImVec2(Columns[Col], 100.0f), Muted, Headers[Col]); }
        for (const auto& Descriptor : Workspaces::QueryCompileStepDescriptors())
        {
            const auto& Report = Vehicle.InspectStepReport(Descriptor.Category);
            const float Y = 136.0f + static_cast<float>(Descriptor.Category) * 48.0f;
            List->AddRectFilled(ImVec2(36.0f, Y - 8.0f), ImVec2(1138.0f, Y + 32.0f), IM_COL32(31, 37, 48, 255), 5.0f);
            List->AddRectFilled(ImVec2(36.0f, Y - 8.0f), ImVec2(42.0f, Y + 32.0f), QueryStatusColour(Report.Status), 2.0f);
            List->AddText(ImVec2(Columns[0], Y), Title, std::string(Descriptor.Title).c_str());
            List->AddText(ImVec2(Columns[0], Y + 16.0f), Muted, std::string(Descriptor.Note).c_str());
            List->AddText(ImVec2(Columns[1], Y + 6.0f), QueryStatusColour(Report.Status), QueryStatusTitle(Report.Status));
            List->AddText(ImVec2(Columns[2], Y + 6.0f), Title, Report.Summary.c_str());
            char Timing[32] {};
            std::snprintf(Timing, sizeof(Timing), "%.1f ms", Report.DurationMs);
            List->AddText(ImVec2(Columns[3], Y + 6.0f), Muted, Report.Status == CompileStepStatus::Compiled ? Timing : "-");
            List->AddText(ImVec2(Columns[4], Y + 6.0f), Muted, std::to_string(Report.RunCount).c_str());
        }

        // Invalidation snapshots (torus session)
        List->AddRectFilled(ImVec2(24.0f, 560.0f), ImVec2(1776.0f, 976.0f), Panel, 8.0f);
        List->AddText(ImVec2(44.0f, 574.0f), Title, "Downstream-only invalidation (torus session): each column is the step status after the action");
        const std::array<const char*, 4u> Actions {{ "CompileAll", "InvalidateStep(UV)", "InvalidateStep(Geometry)", "Lod off + CompileAll" }};
        const std::array<const StatusSnapshot*, 4u> Snapshots {{ &AfterCompile, &AfterUV, &AfterGeometry, &AfterLodOff }};
        for (std::size_t Col = 0u; Col < 4u; ++Col)
        {
            List->AddText(ImVec2(300.0f + static_cast<float>(Col) * 250.0f, 604.0f), Muted, Actions[Col]);
        }
        for (const auto& Descriptor : Workspaces::QueryCompileStepDescriptors())
        {
            const float Y = 632.0f + static_cast<float>(Descriptor.Category) * 30.0f;
            List->AddText(ImVec2(44.0f, Y), Title, std::string(Descriptor.Title).c_str());
            for (std::size_t Col = 0u; Col < 4u; ++Col)
            {
                const CompileStepStatus Status = (*Snapshots[Col])[static_cast<std::size_t>(Descriptor.Category)];
                const float X = 300.0f + static_cast<float>(Col) * 250.0f;
                List->AddRectFilled(ImVec2(X, Y - 2.0f), ImVec2(X + 210.0f, Y + 20.0f), QueryStatusColour(Status) & IM_COL32(255, 255, 255, 70), 4.0f);
                List->AddText(ImVec2(X + 10.0f, Y), QueryStatusColour(Status), QueryStatusTitle(Status));
            }
        }
        Exhibits::TraceScoreboardColumn(List, Score, ImVec2(1310.0f, 604.0f), 19.0f, 0u, 19u);

        List->AddText(ImVec2(1180.0f, 86.0f), Muted, "Compiled body on Vulkan, tinted per FCT1 slot (PartGroupOrdinal)");
        float LegendX = 1180.0f;
        for (const auto& Layer : SlotLayers)
        {
            const ImU32 Swatch = IM_COL32(static_cast<int>(Layer.LinearTintRGB.X * 255.0f), static_cast<int>(Layer.LinearTintRGB.Y * 255.0f), static_cast<int>(Layer.LinearTintRGB.Z * 255.0f), 255);
            List->AddRectFilled(ImVec2(LegendX, 538.0f), ImVec2(LegendX + 10.0f, 548.0f), Swatch);
            List->AddText(ImVec2(LegendX + 14.0f, 535.0f), Muted, Layer.LayerTitle.c_str());
            LegendX += 14.0f + ImGui::CalcTextSize(Layer.LayerTitle.c_str()).x + 12.0f;
        }
        Score.Check(Studio.WriteCanvas(RepoRoot / "Exhibits/Images/GeometryCompiler/02-CompileStepTimeline.png", Blits, { 16, 18, 23, 255 }),
                    "Wrote 02-CompileStepTimeline.png");
    }

    // 03 — collision fits on the compiled body
    {
        std::vector<Mathematics::Axis3D> BodyPoints {};
        for (const auto& Vert : Vehicle.InspectGeometryOutput().Network.Vertices) { BodyPoints.push_back(Vert.Axes); }
        const std::array<CollisionShapeCategory, 3u> Categories {{ CollisionShapeCategory::Box, CollisionShapeCategory::Sphere, CollisionShapeCategory::Capsule }};

        std::vector<Exhibits::GeometryCompileExhibitStudio::PendingTileBlit> Blits(1u);
        Blits[0].X = 30u; Blits[0].Y = 110u; Blits[0].Width = 520u; Blits[0].Height = 380u;
        (void)Studio.RenderNetworkTile(SlotNetwork, SlotLayers, GeometricRaster::SurfaceDisplayMode::PriorityLayerTint,
                                       Blits[0].Width, Blits[0].Height, Blits[0].Rgba, 0.0f, 0.02f);

        ImDrawList* List = Studio.BeginLabelCanvas();
        List->AddText(ImVec2(30.0f, 24.0f), IM_COL32(236, 239, 244, 255), "G2 - CollisionFitSolver (SimulationSpace/PhysicsSpace) on the compiled vehicle body");
        List->AddText(ImVec2(30.0f, 50.0f), IM_COL32(150, 162, 182, 255), "Top row: side view (X right, Z up).  Bottom row: plan view (X right, Y up).  Dots = compiled vertices, green = fitted proxy.");
        List->AddText(ImVec2(30.0f, 500.0f), IM_COL32(150, 162, 182, 255), "Vulkan side view of the same body (reference)");
        for (std::size_t Idx = 0u; Idx < Categories.size(); ++Idx)
        {
            const CollisionShapeFit Shape = SimulationSpace::PhysicsSpace::FitCollisionShape(BodyPoints, Categories[Idx]);
            const float Volume = SimulationSpace::PhysicsSpace::EvaluateCollisionShapeVolume(Shape);
            bool Encloses = true;
            for (const auto& P : BodyPoints)
            {
                if (Categories[Idx] == CollisionShapeCategory::Sphere) { Encloses = Encloses && Mathematics::EvaluateDistance(P, Shape.Centre) <= Shape.Radius + 1.0e-4f; }
            }
            char Caption[128] {};
            std::snprintf(Caption, sizeof(Caption), "%s  |  %.2f m3", std::string(Workspaces::QueryCollisionShapeTitle(Categories[Idx])).c_str(), Volume);
            const float X0 = 580.0f + static_cast<float>(Idx) * 400.0f;
            TraceCollisionDiagram(List, ImVec2(X0, 90.0f), ImVec2(X0 + 380.0f, 500.0f), BodyPoints, Shape, 0, 2, Caption);
            TraceCollisionDiagram(List, ImVec2(X0, 520.0f), ImVec2(X0 + 380.0f, 970.0f), BodyPoints, Shape, 0, 1, Caption);
            Score.Check(Encloses && Volume > 0.0f, std::string("Body ") + Caption);
        }
        Exhibits::TraceScoreboardColumn(List, Score, ImVec2(30.0f, 540.0f), 19.0f, 19u, 22u);
        Score.Check(Studio.WriteCanvas(RepoRoot / "Exhibits/Images/GeometryCompiler/03-CollisionFits.png", Blits, { 16, 18, 23, 255 }),
                    "Wrote 03-CollisionFits.png");
    }
    Studio.Teardown();

    for (const auto& Line : Score.Lines)
    {
        std::printf("  %s %s\n", Line.Passed ? "PASS" : "FAIL", Line.Label.c_str());
    }
    std::printf("[GeometryCompileValidation] %zu checks, %u failed\n", Score.Lines.size(), Score.QueryFailedCount());
    return Score.QueryFailedCount() == 0u ? 0 : 1;
}
