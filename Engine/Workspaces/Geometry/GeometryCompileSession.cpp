/*============================================================================================================================================
                                                         GEOMETRYCOMPILESESSION.CPP
============================================================================================================================================*/
// 🧩 Implementation of the headless Geometry Compile step runners, dependency resolution & downstream invalidation

//------------------------------------------------------------------------------------------------------------------------
//                                                        INCLUDES
//------------------------------------------------------------------------------------------------------------------------

#include "Engine/Workspaces/Geometry/GeometryCompileSession.h"

#include "Engine/GeometrySpace/Analysis/CurvatureAnalysis.h"
#include "Engine/Mathematics/CoordinateSpace.h"

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <set>
#include <sstream>

namespace Frontier::Workspaces
{

namespace
{

using SimulationSpace::PhysicsSpace::CollisionShapeCategory;

[[nodiscard]] uint32_t CountTriangles(const GeometrySpace::PolygonNetwork& Network) noexcept
{
    uint32_t Triangles = 0u;
    for (const GeometrySpace::Face& CurrentFace : Network.Faces)
    {
        Triangles += (CurrentFace.CornerCount >= 3u) ? static_cast<uint32_t>(CurrentFace.CornerCount - 2u) : 0u;
    }
    return Triangles;
}

[[nodiscard]] SimulationSpace::PhysicsSpace::AxisAlignedBounds EvaluateNetworkBounds(const GeometrySpace::PolygonNetwork& Network)
{
    std::vector<Mathematics::Axis3D> Points {};
    Points.reserve(Network.Vertices.size());
    for (const GeometrySpace::Vertex& Vert : Network.Vertices)
    {
        Points.push_back(Vert.Axes);
    }
    return SimulationSpace::PhysicsSpace::EvaluateAxisAlignedBounds(Points);
}

[[nodiscard]] std::string FormatThousands(uint32_t Count)
{
    std::string Digits = std::to_string(Count);
    for (int Insert = static_cast<int>(Digits.size()) - 3; Insert > 0; Insert -= 3)
    {
        Digits.insert(static_cast<std::size_t>(Insert), ",");
    }
    return Digits;
}

[[nodiscard]] Mathematics::WorldCoordinateBasis ResolveDeclaredBasis(SourceUpAxis UpAxis, Mathematics::WorldCoordinateBasis FormatBasis) noexcept
{
    switch (UpAxis)
    {
        case SourceUpAxis::YUp:           return Mathematics::WorldCoordinateBasis::RightHandedYUp;
        case SourceUpAxis::ZUp:           return Mathematics::WorldCoordinateBasis::RightHandedZUp;
        case SourceUpAxis::FormatDefault: break;
    }
    return FormatBasis;
}

[[nodiscard]] uint8_t QueryActiveUpOrdinal() noexcept
{
    return (Mathematics::QueryActiveWorldBasis() == Mathematics::WorldCoordinateBasis::RightHandedZUp) ? 2u : 1u;
}

} // namespace

//------------------------------------------------------------------------------------------------------------------------
//                                                  SOURCE ASSIGNMENT
//------------------------------------------------------------------------------------------------------------------------

bool GeometryCompileSession::LoadSourceFile(const std::filesystem::path& SourcePath, std::string& OutDiagnostic)
{
    GeometrySpace::ConstructedSampleAsset Imported {};
    if (!Interchange::GeometryInterchange::ImportAssetFromFile(SourcePath, Imported, OutDiagnostic))
    {
        return false;
    }
    AssignSourceAsset(std::move(Imported), Interchange::GeometryInterchange::DetectFormatFromPath(SourcePath), SourcePath.stem().string());
    return true;
}

void GeometryCompileSession::AssignSourceAsset(
    GeometrySpace::ConstructedSampleAsset Asset,
    Interchange::ExternalGeometryFormat   Format,
    std::string                           Title)
{
    SourceAsset  = std::move(Asset);
    SourceFormat = Format;
    AssetTitle   = Title;
    if (Directives.Meta.Title.empty())
    {
        Directives.Meta.Title = std::move(Title);
    }
    StepReports     = {};
    SourceOutput    = {};
    GeometryOutput  = {};
    CollisionOutput = {};
    for (const CompileStepDescriptor& Descriptor : QueryCompileStepDescriptors())
    {
        StepReports[static_cast<std::size_t>(Descriptor.Category)].Status =
            QueryStepEnabled(Descriptor.Category) ? CompileStepStatus::Stale : CompileStepStatus::Disabled;
    }
}

//------------------------------------------------------------------------------------------------------------------------
//                                                  INVALIDATION & SCHEDULING
//------------------------------------------------------------------------------------------------------------------------

bool GeometryCompileSession::QueryStepEnabled(CompileStepCategory Category) const noexcept
{
    switch (Category)
    {
        case CompileStepCategory::UV:        return Directives.UV.Enabled;
        case CompileStepCategory::SDF:       return Directives.SDF.Enabled;
        case CompileStepCategory::Lod:       return Directives.Lod.Enabled;
        case CompileStepCategory::Collision: return Directives.Collision.Enabled;
        case CompileStepCategory::Icon:      return Directives.Icon.Enabled;
        case CompileStepCategory::Source:
        case CompileStepCategory::Geometry:
        case CompileStepCategory::Meta:      return true;
    }
    return true;
}

void GeometryCompileSession::InvalidateStep(CompileStepCategory Category)
{
    CompileStepReport& Report = StepReports[static_cast<std::size_t>(Category)];
    Report.Status = QueryStepEnabled(Category) ? CompileStepStatus::Stale : CompileStepStatus::Disabled;

    const uint8_t CategoryBit = static_cast<uint8_t>(1u << static_cast<uint8_t>(Category));
    for (const CompileStepDescriptor& Descriptor : QueryCompileStepDescriptors())
    {
        if ((Descriptor.DependencyMask & CategoryBit) != 0u)
        {
            InvalidateStep(Descriptor.Category);
        }
    }
}

bool GeometryCompileSession::RunStep(CompileStepCategory Category)
{
    const CompileStepDescriptor& Descriptor = InspectCompileStepDescriptor(Category);
    CompileStepReport&           Report     = StepReports[static_cast<std::size_t>(Category)];
    if (!QueryStepEnabled(Category))
    {
        Report.Status = CompileStepStatus::Disabled;
        return true;
    }

    for (const CompileStepDescriptor& Upstream : QueryCompileStepDescriptors())
    {
        const uint8_t UpstreamBit = static_cast<uint8_t>(1u << static_cast<uint8_t>(Upstream.Category));
        if ((Descriptor.DependencyMask & UpstreamBit) == 0u ||
            StepReports[static_cast<std::size_t>(Upstream.Category)].Status == CompileStepStatus::Compiled)
        {
            continue;
        }
        if (!RunStep(Upstream.Category))
        {
            Report.Status     = CompileStepStatus::Failed;
            Report.Diagnostic = std::string(Upstream.Title) + " failed upstream";
            return false;
        }
    }

    if (!Descriptor.MilestoneNote.empty())
    {
        Report.Status     = CompileStepStatus::Deferred;
        Report.Summary    = "runner lands in " + std::string(Descriptor.MilestoneNote);
        Report.Diagnostic.clear();
        return true;
    }

    const auto Started = std::chrono::steady_clock::now();
    Report.Diagnostic.clear();
    bool Succeeded = false;
    switch (Category)
    {
        case CompileStepCategory::Source:    Succeeded = ExecuteSourceStep(Report);    break;
        case CompileStepCategory::Geometry:  Succeeded = ExecuteGeometryStep(Report);  break;
        case CompileStepCategory::Collision: Succeeded = ExecuteCollisionStep(Report); break;
        case CompileStepCategory::Meta:      Succeeded = ExecuteMetaStep(Report);      break;
        case CompileStepCategory::UV:
        case CompileStepCategory::SDF:
        case CompileStepCategory::Lod:
        case CompileStepCategory::Icon:      break;
    }
    Report.DurationMs = std::chrono::duration<float, std::milli>(std::chrono::steady_clock::now() - Started).count();
    ++Report.RunCount;
    Report.Status = Succeeded ? CompileStepStatus::Compiled : CompileStepStatus::Failed;
    return Succeeded;
}

bool GeometryCompileSession::CompileAll()
{
    bool AllSucceeded = true;
    for (const CompileStepDescriptor& Descriptor : QueryCompileStepDescriptors())
    {
        const CompileStepStatus Status = StepReports[static_cast<std::size_t>(Descriptor.Category)].Status;
        if (Status == CompileStepStatus::Stale || Status == CompileStepStatus::Failed)
        {
            AllSucceeded = RunStep(Descriptor.Category) && AllSucceeded;
        }
    }
    return AllSucceeded;
}

std::vector<CompileStepCategory> GeometryCompileSession::QueryStaleSteps() const
{
    std::vector<CompileStepCategory> Stale {};
    for (const CompileStepDescriptor& Descriptor : QueryCompileStepDescriptors())
    {
        const CompileStepStatus Status = StepReports[static_cast<std::size_t>(Descriptor.Category)].Status;
        if (Status == CompileStepStatus::Stale || Status == CompileStepStatus::Failed)
        {
            Stale.push_back(Descriptor.Category);
        }
    }
    return Stale;
}

bool GeometryCompileSession::QueryFullyCompiled() const noexcept
{
    return std::all_of(StepReports.begin(), StepReports.end(), [](const CompileStepReport& Report)
    {
        return Report.Status == CompileStepStatus::Compiled ||
               Report.Status == CompileStepStatus::Disabled ||
               Report.Status == CompileStepStatus::Deferred;
    });
}

const CompileStepReport& GeometryCompileSession::InspectStepReport(CompileStepCategory Category) const noexcept
{
    return StepReports[static_cast<std::size_t>(Category) % CompileStepCount];
}

//------------------------------------------------------------------------------------------------------------------------
//                                                  STEP RUNNERS
//------------------------------------------------------------------------------------------------------------------------

bool GeometryCompileSession::ExecuteSourceStep(CompileStepReport& Report)
{
    if (SourceAsset.Network.Faces.empty())
    {
        Report.Diagnostic = "No source geometry assigned";
        return false;
    }

    SourceOutput         = {};
    SourceOutput.Network = SourceAsset.Network;
    GeometrySpace::PolygonNetwork& Network = SourceOutput.Network;

    // ① Up axis: undo the reader's assumed basis, then apply the declared one (no-op when they agree)
    const auto ActiveBasis   = Mathematics::QueryActiveWorldBasis();
    const auto AssumedBasis  = Interchange::GeometryInterchange::QueryAuthoredBasis(SourceFormat);
    const auto DeclaredBasis = ResolveDeclaredBasis(Directives.Source.UpAxis, AssumedBasis);
    // ② Length unit
    const float λ = QuerySourceLengthScale(Directives.Source.Unit); // [m/unit]
    for (GeometrySpace::Vertex& Vert : Network.Vertices)
    {
        Mathematics::Axis3D P = Vert.Axes;
        if (DeclaredBasis != AssumedBasis)
        {
            P = Mathematics::ConvertVectorBetweenBases(Mathematics::ConvertVectorBetweenBases(P, ActiveBasis, AssumedBasis), DeclaredBasis, ActiveBasis);
        }
        Vert.Axes = P * λ;
    }
    ++Network.NetworkRevision;

    // ③ Weld (tolerance 0 still merges exact duplicates), then the watertight audit
    (void)GeometrySpace::WeldCoincidentVertices(Network, std::max(0.0f, Directives.Source.WeldToleranceMeters));
    Network.RecomputeNormals();
    SourceOutput.Audit         = GeometrySpace::EvaluateWatertightAudit(Network);
    SourceOutput.Bounds        = EvaluateNetworkBounds(Network);
    SourceOutput.TriangleCount = CountTriangles(Network);

    const bool Closed = SourceOutput.Audit.OpenBoundaryEdgeCount == 0u && SourceOutput.Audit.NonManifoldEdgeCount == 0u;
    Report.Summary = FormatThousands(SourceOutput.TriangleCount) + " tris · " +
        (Closed ? std::string("closed") : FormatThousands(SourceOutput.Audit.OpenBoundaryEdgeCount) + " open edges");
    return true;
}

bool GeometryCompileSession::ExecuteGeometryStep(CompileStepReport& Report)
{
    GeometryOutput         = {};
    GeometryOutput.Network = SourceOutput.Network;
    GeometrySpace::PolygonNetwork& Network    = GeometryOutput.Network;
    const GeometryDirectives&      Directive  = Directives.Geometry;

    // ① Scale (sign = mirror, magnitude clamped to 1 mm) then Euler X → Y → Z through ApplySpatialTransform
    Mathematics::SpatialTransform Transform = Directive.Transform;
    Transform.Position = { 0.0f, 0.0f, 0.0f };
    uint32_t MirrorCount = 0u;
    for (float* Component : { &Transform.Scale.X, &Transform.Scale.Y, &Transform.Scale.Z })
    {
        MirrorCount += (*Component < 0.0f) ? 1u : 0u;
        *Component   = std::copysign(std::max(1.0e-3f, std::fabs(*Component)), *Component);
    }
    for (GeometrySpace::Vertex& Vert : Network.Vertices)
    {
        Vert.Axes = Mathematics::ApplySpatialTransform(Transform, Vert.Axes);
    }

    // ② Pivot
    if (Directive.Pivot != PivotPlacement::None && !Network.Vertices.empty())
    {
        const auto          Bounds = EvaluateNetworkBounds(Network);
        Mathematics::Axis3D Offset = Bounds.QueryCentre();
        if (Directive.Pivot == PivotPlacement::Floor)
        {
            (QueryActiveUpOrdinal() == 2u) ? (Offset.Z = Bounds.Minimum.Z) : (Offset.Y = Bounds.Minimum.Y);
        }
        for (GeometrySpace::Vertex& Vert : Network.Vertices)
        {
            Vert.Axes = Vert.Axes - Offset;
        }
    }
    ++Network.NetworkRevision;

    // ③ An odd mirror count reflects the surface; ReverseNormals reverses it again
    if (((MirrorCount % 2u) == 1u) != Directive.ReverseNormals)
    {
        GeometrySpace::ReverseNetworkWinding(Network);
    }
    Network.RecomputeNormals();

    // ④ Corner normals (one per DirectedEdge)
    GeometryOutput.CornerNormals.assign(Network.Edges.size(), { 0.0f, 0.0f, 1.0f });
    switch (Directive.Normals)
    {
        case CornerNormalMode::Flat:
        case CornerNormalMode::Smooth:
            for (uint32_t EdgeIdx = 0u; EdgeIdx < static_cast<uint32_t>(Network.Edges.size()); ++EdgeIdx)
            {
                const GeometrySpace::DirectedEdge& Edge = Network.Edges[EdgeIdx];
                if (Edge.EnclosingFaceIndex >= Network.Faces.size())
                {
                    continue;
                }
                const Mathematics::Axis3D FaceNormal = Network.Faces[Edge.EnclosingFaceIndex].GeometricNormal;
                GeometryOutput.CornerNormals[EdgeIdx] = (Directive.Normals == CornerNormalMode::Flat)
                    ? FaceNormal
                    : Mathematics::NormalizeAxis(Network.Vertices[Edge.OriginVertexIndex].Normal, FaceNormal);
            }
            break;
        case CornerNormalMode::AngleSplit:
            Network.MarkDihedralSharpSeams(Directive.CreaseAngleDegrees, false);
            GeometryOutput.CornerNormals = GeometrySpace::EvaluateCreaseCornerNormals(Network, Directive.CreaseAngleDegrees);
            break;
    }

    std::set<uint16_t> Slots {};
    for (const GeometrySpace::Face& CurrentFace : Network.Faces)
    {
        Slots.insert(CurrentFace.PartGroupOrdinal);
    }
    GeometryOutput.SlotCount     = static_cast<uint32_t>(Slots.size());
    GeometryOutput.Bounds        = EvaluateNetworkBounds(Network);
    GeometryOutput.TriangleCount = CountTriangles(Network);

    const Mathematics::Axis3D Size = GeometryOutput.Bounds.QuerySize();
    char Line[128] {};
    std::snprintf(Line, sizeof(Line), "%.2f × %.2f × %.2f m · %s normals",
        static_cast<double>(Size.X), static_cast<double>(Size.Y), static_cast<double>(Size.Z),
        std::string(QueryCornerNormalModeTitle(Directive.Normals)).c_str());
    Report.Summary = Line;
    return true;
}

bool GeometryCompileSession::ExecuteCollisionStep(CompileStepReport& Report)
{
    std::vector<Mathematics::Axis3D> Points {};
    Points.reserve(GeometryOutput.Network.Vertices.size());
    for (const GeometrySpace::Vertex& Vert : GeometryOutput.Network.Vertices)
    {
        Points.push_back(Vert.Axes);
    }
    CollisionOutput.Shape             = SimulationSpace::PhysicsSpace::FitCollisionShape(Points, Directives.Collision.Category, Directives.Collision.MarginMeters);
    CollisionOutput.VolumeCubicMeters = SimulationSpace::PhysicsSpace::EvaluateCollisionShapeVolume(CollisionOutput.Shape);

    if (Directives.Collision.Category == CollisionShapeCategory::None)
    {
        Report.Summary = "no collision";
        return true;
    }
    char Line[96] {};
    std::snprintf(Line, sizeof(Line), "%s · %.2f m³",
        std::string(QueryCollisionShapeTitle(Directives.Collision.Category)).c_str(),
        static_cast<double>(CollisionOutput.VolumeCubicMeters));
    Report.Summary = Line;
    return true;
}

bool GeometryCompileSession::ExecuteMetaStep(CompileStepReport& Report)
{
    const auto Trim = [](std::string_view Text)
    {
        const std::size_t First = Text.find_first_not_of(" \t\r\n");
        const std::size_t Last  = Text.find_last_not_of(" \t\r\n");
        return (First == std::string_view::npos) ? std::string() : std::string(Text.substr(First, Last - First + 1u));
    };

    const std::string Title = Trim(Directives.Meta.Title);
    if (Title.empty())
    {
        Report.Diagnostic = "Name is required";
        return false;
    }
    AssetTitle = Title;

    uint32_t           TagCount = 0u;
    std::istringstream Tags(Directives.Meta.Tags);
    std::string        Tag;
    while (std::getline(Tags, Tag, ','))
    {
        TagCount += Trim(Tag).empty() ? 0u : 1u;
    }
    Report.Summary = Directives.Meta.Category + (TagCount > 0u ? " · " + std::to_string(TagCount) + " tags" : std::string());
    return true;
}

} // namespace Frontier::Workspaces
