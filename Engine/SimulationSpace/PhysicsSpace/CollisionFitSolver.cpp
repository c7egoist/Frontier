/*============================================================================================================================================
                                                           COLLISIONFITSOLVER.CPP
============================================================================================================================================*/
// 🧩 Implementation of axis-aligned box, Ritter sphere & long-axis capsule collision proxy fitting

//------------------------------------------------------------------------------------------------------------------------
//                                                        INCLUDES
//------------------------------------------------------------------------------------------------------------------------

#include "Engine/SimulationSpace/PhysicsSpace/CollisionFitSolver.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <limits>
#include <numbers>

namespace Frontier::SimulationSpace::PhysicsSpace
{

namespace
{

[[nodiscard]] float ReadAxisComponent(Mathematics::Axis3D Vector, uint8_t AxisOrdinal) noexcept
{
    return (AxisOrdinal == 0u) ? Vector.X : ((AxisOrdinal == 1u) ? Vector.Y : Vector.Z);
}

// Ritter (1990): seed from the farthest pair found by two sweeps, then grow towards every outlier.
void EvaluateRitterSphere(std::span<const Mathematics::Axis3D> Points, Mathematics::Axis3D& OutCentre, float& OutRadius) noexcept
{
    std::size_t SeedA = 0u;
    float       BestSq = -1.0f;
    for (std::size_t Idx = 0u; Idx < Points.size(); ++Idx)
    {
        const float DistSq = Mathematics::EvaluateLengthSquared(Points[Idx] - Points[0]);
        if (DistSq > BestSq) { BestSq = DistSq; SeedA = Idx; }
    }
    std::size_t SeedB = SeedA;
    BestSq = -1.0f;
    for (std::size_t Idx = 0u; Idx < Points.size(); ++Idx)
    {
        const float DistSq = Mathematics::EvaluateLengthSquared(Points[Idx] - Points[SeedA]);
        if (DistSq > BestSq) { BestSq = DistSq; SeedB = Idx; }
    }

    Mathematics::Axis3D Centre = (Points[SeedA] + Points[SeedB]) * 0.5f;
    float               ρ      = std::sqrt(std::max(0.0f, BestSq)) * 0.5f; // [m] - Running radius
    for (const Mathematics::Axis3D Point : Points)
    {
        const float Distance = Mathematics::EvaluateDistance(Point, Centre);
        if (Distance > ρ)
        {
            const float GrownRadius = (ρ + Distance) * 0.5f;
            Centre = Centre + (Point - Centre) * ((GrownRadius - ρ) / Distance);
            ρ      = GrownRadius;
        }
    }
    OutCentre = Centre;
    OutRadius = ρ;
}

} // namespace

//------------------------------------------------------------------------------------------------------------------------
//                                                  BOUNDS & PROXY FITTING
//------------------------------------------------------------------------------------------------------------------------

AxisAlignedBounds EvaluateAxisAlignedBounds(std::span<const Mathematics::Axis3D> Points) noexcept
{
    if (Points.empty())
    {
        return {};
    }
    constexpr float Huge = std::numeric_limits<float>::max();
    AxisAlignedBounds Bounds { { Huge, Huge, Huge }, { -Huge, -Huge, -Huge } };
    for (const Mathematics::Axis3D Point : Points)
    {
        Bounds.Minimum = { std::min(Bounds.Minimum.X, Point.X), std::min(Bounds.Minimum.Y, Point.Y), std::min(Bounds.Minimum.Z, Point.Z) };
        Bounds.Maximum = { std::max(Bounds.Maximum.X, Point.X), std::max(Bounds.Maximum.Y, Point.Y), std::max(Bounds.Maximum.Z, Point.Z) };
    }
    return Bounds;
}

CollisionShapeFit FitCollisionShape(
    std::span<const Mathematics::Axis3D> Points,
    CollisionShapeCategory               Category,
    float                                MarginMeters) noexcept
{
    CollisionShapeFit Shape {};
    if (Points.empty() || Category == CollisionShapeCategory::None)
    {
        return Shape;
    }

    const AxisAlignedBounds   Bounds = EvaluateAxisAlignedBounds(Points);
    const Mathematics::Axis3D Size   = Bounds.QuerySize();
    Shape.Category = Category;
    Shape.Centre   = Bounds.QueryCentre();

    switch (Category)
    {
        case CollisionShapeCategory::Box:
            Shape.HalfExtents = Size * 0.5f + Mathematics::Axis3D{ MarginMeters, MarginMeters, MarginMeters };
            break;

        case CollisionShapeCategory::Sphere:
            EvaluateRitterSphere(Points, Shape.Centre, Shape.Radius);
            Shape.Radius += MarginMeters;
            break;

        case CollisionShapeCategory::Capsule:
        {
            const std::array<float, 3u> Spans {{ Size.X, Size.Y, Size.Z }};
            Shape.AxisOrdinal = static_cast<uint8_t>(std::distance(Spans.begin(), std::max_element(Spans.begin(), Spans.end())));
            const uint8_t CrossA = static_cast<uint8_t>((Shape.AxisOrdinal + 1u) % 3u);
            const uint8_t CrossB = static_cast<uint8_t>((Shape.AxisOrdinal + 2u) % 3u);
            float RadiusSq = 0.0f;
            for (const Mathematics::Axis3D Point : Points)
            {
                const float DeltaA = ReadAxisComponent(Point, CrossA) - ReadAxisComponent(Shape.Centre, CrossA);
                const float DeltaB = ReadAxisComponent(Point, CrossB) - ReadAxisComponent(Shape.Centre, CrossB);
                RadiusSq = std::max(RadiusSq, DeltaA * DeltaA + DeltaB * DeltaB);
            }
            Shape.Radius     = std::sqrt(RadiusSq) + MarginMeters;
            Shape.HalfHeight = std::max(0.0f, Spans[Shape.AxisOrdinal] * 0.5f + MarginMeters - Shape.Radius);
            break;
        }

        case CollisionShapeCategory::None:
            break;
    }
    return Shape;
}

float EvaluateCollisionShapeVolume(const CollisionShapeFit& Shape) noexcept
{
    constexpr float π = std::numbers::pi_v<float>;
    switch (Shape.Category)
    {
        case CollisionShapeCategory::Box:
            return 8.0f * Shape.HalfExtents.X * Shape.HalfExtents.Y * Shape.HalfExtents.Z;
        case CollisionShapeCategory::Sphere:
            return (4.0f / 3.0f) * π * Shape.Radius * Shape.Radius * Shape.Radius;
        case CollisionShapeCategory::Capsule:
            return π * Shape.Radius * Shape.Radius * (2.0f * Shape.HalfHeight) + (4.0f / 3.0f) * π * Shape.Radius * Shape.Radius * Shape.Radius;
        case CollisionShapeCategory::None:
            break;
    }
    return 0.0f;
}

} // namespace Frontier::SimulationSpace::PhysicsSpace
