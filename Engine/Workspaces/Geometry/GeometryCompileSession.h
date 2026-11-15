/*============================================================================================================================================
                                                          GEOMETRYCOMPILESESSION.H
============================================================================================================================================*/
// 🧩 Headless Geometry Compile session: imported PolygonNetwork → units, weld, transform, normals, collision & metadata steps

#pragma once

//------------------------------------------------------------------------------------------------------------------------
//                                                        INCLUDES
//------------------------------------------------------------------------------------------------------------------------

#include "Engine/GeometrySpace/Network/FacePartitionRegister.h"
#include "Engine/GeometrySpace/Network/PolygonNetwork.h"
#include "Engine/GeometrySpace/Primitives/AnalyticPrimitives.h"
#include "Engine/GeometrySpace/Primitives/WatertightSewing.h"
#include "Engine/Interchange/GeometryInterchange.h"
#include "Engine/SimulationSpace/PhysicsSpace/CollisionFitSolver.h"
#include "Engine/Workspaces/Geometry/GeometryCompileSteps.h"

#include <array>
#include <cstdint>
#include <filesystem>
#include <string>
#include <vector>

namespace Frontier::Workspaces
{

//------------------------------------------------------------------------------------------------------------------------
//                                                       STRUCTURES
//------------------------------------------------------------------------------------------------------------------------

struct SourceStepOutput
{
    GeometrySpace::PolygonNetwork                   Network       {}; // [-]     - Unit-scaled, re-based, welded network
    GeometrySpace::WatertightAuditSummary           Audit         {}; // [-]     - Open / non-manifold edges, parts, area
    SimulationSpace::PhysicsSpace::AxisAlignedBounds Bounds       {}; // [m]     - Active-basis bounds
    uint32_t                                        TriangleCount = 0u; // [count] - Σ (CornerCount − 2)
};

struct GeometryStepOutput
{
    GeometrySpace::PolygonNetwork                   Network       {}; // [-]     - Transformed, pivoted network
    std::vector<Mathematics::Axis3D>                CornerNormals {}; // [-]     - One unit normal per DirectedEdge
    SimulationSpace::PhysicsSpace::AxisAlignedBounds Bounds       {}; // [m]     - Active-basis bounds
    uint32_t                                        TriangleCount = 0u; // [count] - Σ (CornerCount − 2)
    uint32_t                                        SlotCount     = 0u; // [count] - Distinct Face.PartGroupOrdinal values
};

struct CollisionStepOutput
{
    SimulationSpace::PhysicsSpace::CollisionShapeFit Shape            {};   // [-]   - Fitted proxy
    float                                           VolumeCubicMeters = 0.0f; // [m^3] - Proxy volume
};

class GeometryCompileSession
{
public:
    // Imports through Interchange::GeometryInterchange and resets every step to Stale.
    [[nodiscard]] bool LoadSourceFile(const std::filesystem::path& SourcePath, std::string& OutDiagnostic);

    void AssignSourceAsset(
        GeometrySpace::ConstructedSampleAsset Asset,
        Interchange::ExternalGeometryFormat   Format,
        std::string                           Title);

    [[nodiscard]] GeometryCompileDirectives&       AccessDirectives() noexcept       { return Directives; }
    [[nodiscard]] const GeometryCompileDirectives& InspectDirectives() const noexcept { return Directives; }

    // Marks Category and every step downstream of it Stale (Disabled when optional and switched off).
    void InvalidateStep(CompileStepCategory Category);

    // Runs missing dependencies first; returns false when this step or an upstream step fails.
    bool RunStep(CompileStepCategory Category);
    bool CompileAll();

    [[nodiscard]] std::vector<CompileStepCategory> QueryStaleSteps() const;
    [[nodiscard]] bool                             QueryFullyCompiled() const noexcept;

    [[nodiscard]] const CompileStepReport& InspectStepReport(CompileStepCategory Category) const noexcept;
    [[nodiscard]] const GeometrySpace::ConstructedSampleAsset& InspectSourceAsset() const noexcept { return SourceAsset; }
    [[nodiscard]] const SourceStepOutput&    InspectSourceOutput() const noexcept    { return SourceOutput; }
    [[nodiscard]] const GeometryStepOutput&  InspectGeometryOutput() const noexcept  { return GeometryOutput; }
    [[nodiscard]] const CollisionStepOutput& InspectCollisionOutput() const noexcept { return CollisionOutput; }
    [[nodiscard]] const std::string&         InspectAssetTitle() const noexcept      { return AssetTitle; }

private:
    [[nodiscard]] bool QueryStepEnabled(CompileStepCategory Category) const noexcept;
    [[nodiscard]] bool ExecuteSourceStep(CompileStepReport& Report);
    [[nodiscard]] bool ExecuteGeometryStep(CompileStepReport& Report);
    [[nodiscard]] bool ExecuteCollisionStep(CompileStepReport& Report);
    [[nodiscard]] bool ExecuteMetaStep(CompileStepReport& Report);

    GeometrySpace::ConstructedSampleAsset             SourceAsset     {};
    Interchange::ExternalGeometryFormat               SourceFormat    = Interchange::ExternalGeometryFormat::Unknown;
    std::string                                       AssetTitle      {};
    GeometryCompileDirectives                         Directives      {};
    std::array<CompileStepReport, CompileStepCount>   StepReports     {};
    SourceStepOutput                                  SourceOutput    {};
    GeometryStepOutput                                GeometryOutput  {};
    CollisionStepOutput                               CollisionOutput {};
};

} // namespace Frontier::Workspaces
