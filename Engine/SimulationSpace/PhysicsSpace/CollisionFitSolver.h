/*============================================================================================================================================
                                                            COLLISIONFITSOLVER.H
============================================================================================================================================*/
// 🧩 Fits simple collision proxies (axis-aligned box, Ritter sphere, long-axis capsule) around a point cloud in asset space

#pragma once

//------------------------------------------------------------------------------------------------------------------------
//                                                        INCLUDES
//------------------------------------------------------------------------------------------------------------------------

#include "Engine/Mathematics/AxisCoordinates.h"

#include <cstdint>
#include <span>

namespace Frontier::SimulationSpace::PhysicsSpace
{

//------------------------------------------------------------------------------------------------------------------------
//                                                      ENUMERATIONS
//------------------------------------------------------------------------------------------------------------------------

enum class CollisionShapeCategory : uint8_t
{
    None    = 0u, // [-] - No collision proxy
    Box     = 1u, // [-] - Axis-aligned box around the bounds
    Sphere  = 2u, // [-] - Ritter (1990) enclosing sphere
    Capsule = 3u, // [-] - Capsule along the longest bounds axis
};

//------------------------------------------------------------------------------------------------------------------------
//                                                       STRUCTURES
//------------------------------------------------------------------------------------------------------------------------

struct AxisAlignedBounds
{
    Mathematics::Axis3D Minimum { 0.0f, 0.0f, 0.0f }; // [m] - Lower corner
    Mathematics::Axis3D Maximum { 0.0f, 0.0f, 0.0f }; // [m] - Upper corner

    [[nodiscard]] constexpr Mathematics::Axis3D QueryCentre() const noexcept { return (Minimum + Maximum) * 0.5f; }
    [[nodiscard]] constexpr Mathematics::Axis3D QuerySize() const noexcept   { return Maximum - Minimum; }
};

struct CollisionShapeFit
{
    CollisionShapeCategory Category    = CollisionShapeCategory::None; // [-]   - Fitted proxy category
    Mathematics::Axis3D    Centre      { 0.0f, 0.0f, 0.0f };           // [m]   - Proxy centre in asset space
    Mathematics::Axis3D    HalfExtents { 0.0f, 0.0f, 0.0f };           // [m]   - Box half extents (margin included)
    float                  Radius      = 0.0f;                         // [m]   - Sphere / capsule radius (margin included)
    float                  HalfHeight  = 0.0f;                         // [m]   - Capsule cylinder half length (caps excluded)
    uint8_t                AxisOrdinal = 0u;                           // [idx] - Capsule axis: 0 = X, 1 = Y, 2 = Z
};

//------------------------------------------------------------------------------------------------------------------------
//                                                  FUNCTION PROTOTYPES
//------------------------------------------------------------------------------------------------------------------------

[[nodiscard]] AxisAlignedBounds EvaluateAxisAlignedBounds(std::span<const Mathematics::Axis3D> Points) noexcept;

// Margin grows every proxy outward by the same distance (box faces, sphere and capsule radius, capsule length).
[[nodiscard]] CollisionShapeFit FitCollisionShape(
    std::span<const Mathematics::Axis3D> Points,
    CollisionShapeCategory               Category,
    float                                MarginMeters = 0.0f) noexcept;

[[nodiscard]] float EvaluateCollisionShapeVolume(const CollisionShapeFit& Shape) noexcept;

} // namespace Frontier::SimulationSpace::PhysicsSpace
