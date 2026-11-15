/*============================================================================================================================================
                                                           GEOMETRYCOMPILESTEPS.H
============================================================================================================================================*/
// 🧩 Geometry Compile step sequence (source → geometry → uv / sdf / lod / collision / icon, meta), directives & step reports

#pragma once

//------------------------------------------------------------------------------------------------------------------------
//                                                        INCLUDES
//------------------------------------------------------------------------------------------------------------------------

#include "Engine/Mathematics/AxisCoordinates.h"
#include "Engine/SimulationSpace/PhysicsSpace/CollisionFitSolver.h"

#include <array>
#include <cstdint>
#include <span>
#include <string>
#include <string_view>

namespace Frontier::Workspaces
{

//------------------------------------------------------------------------------------------------------------------------
//                                                      ENUMERATIONS
//------------------------------------------------------------------------------------------------------------------------

enum class CompileStepCategory : uint8_t
{
    Source    = 0u, // [-] - Read, length unit, up axis, weld
    Geometry  = 1u, // [-] - Transform, pivot, corner normals
    UV        = 2u, // [-] - Chart unwrap + pack (G4)
    SDF       = 3u, // [-] - Signed distance volume (G4)
    Lod       = 4u, // [-] - Cluster LOD hierarchy (G3)
    Collision = 5u, // [-] - Simple physics proxy
    Icon      = 6u, // [-] - Content tray thumbnail (G4)
    Meta      = 7u, // [-] - Title, category, tags
};

inline constexpr std::size_t CompileStepCount = 8u;

enum class CompileStepStatus : uint8_t
{
    Stale    = 0u, // [-] - Needs a run (amber)
    Compiled = 1u, // [-] - Output is current (green)
    Disabled = 2u, // [-] - Optional step switched off (grey)
    Failed   = 3u, // [-] - Runner reported a diagnostic (red)
    Deferred = 4u, // [-] - Runner lands in a later milestone; never claims an output (slate)
};

enum class SourceLengthUnit : uint8_t
{
    Meters      = 0u, // [-] - 1 unit = 1 m
    Centimeters = 1u, // [-] - 1 unit = 0.01 m
    Millimeters = 2u, // [-] - 1 unit = 0.001 m
    Inches      = 3u, // [-] - 1 unit = 0.0254 m
    Feet        = 4u, // [-] - 1 unit = 0.3048 m
};

enum class SourceUpAxis : uint8_t
{
    FormatDefault = 0u, // [-] - Trust the reader's authored basis (FCT1 Z-up, every other format Y-up)
    YUp           = 1u, // [-] - Source was authored Y-up
    ZUp           = 2u, // [-] - Source was authored Z-up
};

enum class PivotPlacement : uint8_t
{
    None   = 0u, // [-] - Keep the authored pivot
    Origin = 1u, // [-] - Bounds centre at the origin
    Floor  = 2u, // [-] - Horizontal bounds centre at the origin, lowest point on the floor
};

enum class CornerNormalMode : uint8_t
{
    Flat       = 0u, // [-] - Face GeometricNormal on every corner
    Smooth     = 1u, // [-] - Area-weighted vertex normals (PolygonNetwork::RecomputeNormals)
    AngleSplit = 2u, // [-] - Dihedral creases above CreaseAngleDegrees stay hard
};

//------------------------------------------------------------------------------------------------------------------------
//                                                       STRUCTURES
//------------------------------------------------------------------------------------------------------------------------

struct SourceDirectives
{
    SourceLengthUnit Unit                = SourceLengthUnit::Meters;    // [-] - Authored length unit
    SourceUpAxis     UpAxis              = SourceUpAxis::FormatDefault; // [-] - Authored up axis override
    float            WeldToleranceMeters = 0.0f;                        // [m] - 0 still merges exact duplicates
};

struct GeometryDirectives
{
    Mathematics::SpatialTransform Transform          {};                           // [-] - Scale (negative = mirror), Euler XYZ [rad]; Position ignored
    PivotPlacement                Pivot              = PivotPlacement::Floor;      // [-] - Pivot rule applied after the transform
    CornerNormalMode              Normals            = CornerNormalMode::AngleSplit; // [-] - Corner normal rule
    float                         CreaseAngleDegrees = 40.0f;                      // [°] - AngleSplit crease limit
    bool                          ReverseNormals     = false;                      // [-] - Reverse every face loop after the transform
};

struct OptionalStepDirectives
{
    bool Enabled = true; // [-] - Optional step participates in the compile
};

struct CollisionDirectives
{
    bool                                       Enabled      = true;                                           // [-] - Step participates
    SimulationSpace::PhysicsSpace::CollisionShapeCategory Category = SimulationSpace::PhysicsSpace::CollisionShapeCategory::Box; // [-] - Proxy
    float                                      MarginMeters = 0.0f;                                           // [m] - Outward growth
};

struct MetaDirectives
{
    std::string Title    {};       // [-] - Asset title (required)
    std::string Category { "Prop" }; // [-] - Content tray category
    std::string Tags     {};       // [-] - Comma-separated tags
};

struct GeometryCompileDirectives
{
    SourceDirectives       Source    {};
    GeometryDirectives     Geometry  {};
    OptionalStepDirectives UV        {};
    OptionalStepDirectives SDF       {};
    OptionalStepDirectives Lod       {};
    CollisionDirectives    Collision {};
    OptionalStepDirectives Icon      {};
    MetaDirectives         Meta      {};
};

struct CompileStepDescriptor
{
    CompileStepCategory Category       = CompileStepCategory::Source; // [-]    - Step identity
    std::string_view    Title          {};                            // [-]    - Timeline label
    std::string_view    Note           {};                            // [-]    - One-line description
    uint8_t             DependencyMask = 0u;                          // [mask] - Bit i = depends on CompileStepCategory(i)
    bool                Optional       = false;                       // [-]    - Can be switched off
    std::string_view    MilestoneNote  {};                            // [-]    - Non-empty = runner deferred to that milestone
};

struct CompileStepReport
{
    CompileStepStatus Status     = CompileStepStatus::Stale; // [-]     - Current status
    float             DurationMs = 0.0f;                     // [ms]    - Last run wall time
    uint32_t          RunCount   = 0u;                       // [count] - Times the runner executed
    std::string       Summary    {};                         // [-]     - Inspector one-liner
    std::string       Diagnostic {};                         // [-]     - Failure reason
};

//------------------------------------------------------------------------------------------------------------------------
//                                                  FUNCTION PROTOTYPES
//------------------------------------------------------------------------------------------------------------------------

[[nodiscard]] std::span<const CompileStepDescriptor, CompileStepCount> QueryCompileStepDescriptors() noexcept;

[[nodiscard]] const CompileStepDescriptor& InspectCompileStepDescriptor(CompileStepCategory Category) noexcept;

[[nodiscard]] float QuerySourceLengthScale(SourceLengthUnit Unit) noexcept;

[[nodiscard]] std::string_view QueryCornerNormalModeTitle(CornerNormalMode Mode) noexcept;

[[nodiscard]] std::string_view QueryCollisionShapeTitle(SimulationSpace::PhysicsSpace::CollisionShapeCategory Category) noexcept;

} // namespace Frontier::Workspaces
