/*============================================================================================================================================
                                                          GEOMETRYCOMPILESTEPS.CPP
============================================================================================================================================*/
// 🧩 Geometry Compile step descriptors, dependency masks, length-unit scales & inspector titles

//------------------------------------------------------------------------------------------------------------------------
//                                                        INCLUDES
//------------------------------------------------------------------------------------------------------------------------

#include "Engine/Workspaces/Geometry/GeometryCompileSteps.h"

namespace Frontier::Workspaces
{

namespace
{

constexpr uint8_t SourceBit   = 1u << static_cast<uint8_t>(CompileStepCategory::Source);
constexpr uint8_t GeometryBit = 1u << static_cast<uint8_t>(CompileStepCategory::Geometry);

// 📝 source ─► geometry ─┬─► uv / sdf / lod / collision / icon      meta stands alone
constexpr std::array<CompileStepDescriptor, CompileStepCount> CompileStepDescriptors {{
    { CompileStepCategory::Source,    "Source & Units", "Read, units, up axis, weld",     0u,          false, ""   },
    { CompileStepCategory::Geometry,  "Geometry",       "Transform, pivot, normals",      SourceBit,   false, ""   },
    { CompileStepCategory::UV,        "UV Charts",      "Chart unwrap + pack",            GeometryBit, true,  "G4" },
    { CompileStepCategory::SDF,       "SDF Bake",       "Signed distance volume",         GeometryBit, true,  "G4" },
    { CompileStepCategory::Lod,       "Cluster LOD",    "Cluster hierarchy",              GeometryBit, true,  "G3" },
    { CompileStepCategory::Collision, "Collision",      "Simple physics proxy",           GeometryBit, true,  ""   },
    { CompileStepCategory::Icon,      "Icon Bake",      "Content tray thumbnail",         GeometryBit, true,  "G4" },
    { CompileStepCategory::Meta,      "Metadata",       "Title, category, tags",          0u,          false, ""   },
}};

} // namespace

//------------------------------------------------------------------------------------------------------------------------
//                                                  DESCRIPTOR QUERIES
//------------------------------------------------------------------------------------------------------------------------

std::span<const CompileStepDescriptor, CompileStepCount> QueryCompileStepDescriptors() noexcept
{
    return CompileStepDescriptors;
}

const CompileStepDescriptor& InspectCompileStepDescriptor(CompileStepCategory Category) noexcept
{
    return CompileStepDescriptors[static_cast<std::size_t>(Category) % CompileStepCount];
}

float QuerySourceLengthScale(SourceLengthUnit Unit) noexcept
{
    switch (Unit)
    {
        case SourceLengthUnit::Meters:      return 1.0f;
        case SourceLengthUnit::Centimeters: return 0.01f;
        case SourceLengthUnit::Millimeters: return 0.001f;
        case SourceLengthUnit::Inches:      return 0.0254f;
        case SourceLengthUnit::Feet:        return 0.3048f;
    }
    return 1.0f;
}

std::string_view QueryCornerNormalModeTitle(CornerNormalMode Mode) noexcept
{
    switch (Mode)
    {
        case CornerNormalMode::Flat:       return "flat";
        case CornerNormalMode::Smooth:     return "smooth";
        case CornerNormalMode::AngleSplit: return "angle";
    }
    return "angle";
}

std::string_view QueryCollisionShapeTitle(SimulationSpace::PhysicsSpace::CollisionShapeCategory Category) noexcept
{
    using SimulationSpace::PhysicsSpace::CollisionShapeCategory;
    switch (Category)
    {
        case CollisionShapeCategory::None:    return "none";
        case CollisionShapeCategory::Box:     return "box";
        case CollisionShapeCategory::Sphere:  return "sphere";
        case CollisionShapeCategory::Capsule: return "capsule";
    }
    return "none";
}

} // namespace Frontier::Workspaces
