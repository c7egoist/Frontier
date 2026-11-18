/*============================================================================================================================================
                                                     CLIPMAPSURFACECACHE.CPP
============================================================================================================================================*/
// Static float32 distance clipmaps, object-local vehicle composition, surface-card injection, and cone visibility.

#include "Engine/DistanceFieldSpace/ClipmapSurfaceCache.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <limits>

namespace Frontier::DistanceFieldSpace
{
namespace
{

constexpr float Pi = 3.14159265358979323846f;

float Clamp(float Value, float Minimum, float Maximum) noexcept
{
    return std::max(Minimum, std::min(Maximum, Value));
}

float SignedBox(Vector3 Position, Vector3 Centre, Vector3 HalfExtent) noexcept
{
    const Vector3 Delta {
        std::fabs(Position.X - Centre.X) - HalfExtent.X,
        std::fabs(Position.Y - Centre.Y) - HalfExtent.Y,
        std::fabs(Position.Z - Centre.Z) - HalfExtent.Z,
    };
    const Vector3 Exterior { std::max(Delta.X, 0.0f), std::max(Delta.Y, 0.0f), std::max(Delta.Z, 0.0f) };
    return Length(Exterior) + std::min(std::max({ Delta.X, Delta.Y, Delta.Z }), 0.0f);
}

float SignedCylinderX(Vector3 Position, Vector3 Centre, float Radius, float HalfWidth) noexcept
{
    const float Axial = std::fabs(Position.X - Centre.X) - HalfWidth;
    const float Ring = std::sqrt((Position.Y - Centre.Y) * (Position.Y - Centre.Y) +
                                 (Position.Z - Centre.Z) * (Position.Z - Centre.Z)) - Radius;
    const float ExteriorX = std::max(Axial, 0.0f);
    const float ExteriorR = std::max(Ring, 0.0f);
    return std::sqrt(ExteriorX * ExteriorX + ExteriorR * ExteriorR) + std::min(std::max(Axial, Ring), 0.0f);
}

Vector3 RotateYawInverse(Vector3 Position, const VehiclePlacement& Vehicle) noexcept
{
    const Vector3 Delta = Subtract(Position, Vehicle.Centre);
    const float Cosine = std::cos(Vehicle.YawRadians);
    const float Sine = std::sin(Vehicle.YawRadians);
    return {
        Cosine * Delta.X - Sine * Delta.Z,
        Delta.Y,
        Sine * Delta.X + Cosine * Delta.Z,
    };
}

Vector3 RotateYaw(Vector3 Position, const VehiclePlacement& Vehicle) noexcept
{
    const float Cosine = std::cos(Vehicle.YawRadians);
    const float Sine = std::sin(Vehicle.YawRadians);
    return {
        Vehicle.Centre.X + Cosine * Position.X + Sine * Position.Z,
        Vehicle.Centre.Y + Position.Y,
        Vehicle.Centre.Z - Sine * Position.X + Cosine * Position.Z,
    };
}

uint32_t Flatten(uint32_t X, uint32_t Y, uint32_t Z, uint32_t EdgeSamples) noexcept
{
    return (Z * EdgeSamples + Y) * EdgeSamples + X;
}

float EvaluateTrilinear(const ClipmapLevel& Level, Vector3 WorldPosition) noexcept
{
    const float MaximumCoordinate = static_cast<float>(Level.EdgeSamples - 1u);
    const Vector3 Coordinate {
        Clamp((WorldPosition.X - Level.Minimum.X) / Level.VoxelSpacing, 0.0f, MaximumCoordinate),
        Clamp((WorldPosition.Y - Level.Minimum.Y) / Level.VoxelSpacing, 0.0f, MaximumCoordinate),
        Clamp((WorldPosition.Z - Level.Minimum.Z) / Level.VoxelSpacing, 0.0f, MaximumCoordinate),
    };
    const uint32_t X0 = std::min(static_cast<uint32_t>(std::floor(Coordinate.X)), Level.EdgeSamples - 2u);
    const uint32_t Y0 = std::min(static_cast<uint32_t>(std::floor(Coordinate.Y)), Level.EdgeSamples - 2u);
    const uint32_t Z0 = std::min(static_cast<uint32_t>(std::floor(Coordinate.Z)), Level.EdgeSamples - 2u);
    const uint32_t X1 = X0 + 1u;
    const uint32_t Y1 = Y0 + 1u;
    const uint32_t Z1 = Z0 + 1u;
    const float Tx = Coordinate.X - static_cast<float>(X0);
    const float Ty = Coordinate.Y - static_cast<float>(Y0);
    const float Tz = Coordinate.Z - static_cast<float>(Z0);
    const auto Lerp = [](float Left, float Right, float Weight) { return Left + (Right - Left) * Weight; };
    const float C00 = Lerp(Level.SignedDistance[Flatten(X0, Y0, Z0, Level.EdgeSamples)],
                           Level.SignedDistance[Flatten(X1, Y0, Z0, Level.EdgeSamples)], Tx);
    const float C10 = Lerp(Level.SignedDistance[Flatten(X0, Y1, Z0, Level.EdgeSamples)],
                           Level.SignedDistance[Flatten(X1, Y1, Z0, Level.EdgeSamples)], Tx);
    const float C01 = Lerp(Level.SignedDistance[Flatten(X0, Y0, Z1, Level.EdgeSamples)],
                           Level.SignedDistance[Flatten(X1, Y0, Z1, Level.EdgeSamples)], Tx);
    const float C11 = Lerp(Level.SignedDistance[Flatten(X0, Y1, Z1, Level.EdgeSamples)],
                           Level.SignedDistance[Flatten(X1, Y1, Z1, Level.EdgeSamples)], Tx);
    return Lerp(Lerp(C00, C10, Ty), Lerp(C01, C11, Ty), Tz);
}

bool TraceSdfOpaque(Vector3 Origin, Vector3 Direction, float MaximumDistance,
                    const StaticDistanceClipmap& Clipmap, const VehiclePlacement& Vehicle) noexcept
{
    float Distance = 0.025f;
    const Vector3 UnitDirection = Normalize(Direction);
    for (uint32_t Step = 0u; Step < 192u && Distance < MaximumDistance; ++Step)
    {
        const float FieldDistance = EvaluateHybridDistance(Add(Origin, Multiply(UnitDirection, Distance)), Clipmap, Vehicle);
        if (FieldDistance < 0.004f)
        {
            return true;
        }
        Distance += std::max(0.008f, std::fabs(FieldDistance) * 0.55f);
    }
    return false;
}

Radiance3 DirectCardRadiance(const SurfaceCard& Card, const IlluminationInput& Input,
                             const StaticDistanceClipmap& Clipmap, const VehiclePlacement& Vehicle) noexcept
{
    Radiance3 Accumulated = Card.Emissive && Input.AreaEnabled ? Input.AreaRadiance : Radiance3 {};
    const Vector3 Origin = Add(Card.Centre, Multiply(Card.Normal, 0.025f));
    if (Input.SunEnabled)
    {
        const Vector3 SunDirection = Normalize(Input.SunDirection);
        const float Cosine = std::max(0.0f, Dot(Card.Normal, SunDirection));
        if (Cosine > 0.0f)
        {
            const bool Occluded = TraceSdfOpaque(Origin, SunDirection, 20.0f, Clipmap, Vehicle);
            Accumulated = Add(Accumulated, Multiply(Multiply(Card.Albedo, Input.SunRadiance),
                                                     Cosine * (Occluded ? 0.0f : 1.0f) / Pi));
        }
    }
    if (Input.PointEnabled)
    {
        const Vector3 ToPoint = Subtract(Input.PointPosition, Origin);
        const float DistanceSquared = std::max(0.08f, Dot(ToPoint, ToPoint));
        const Vector3 Direction = Multiply(ToPoint, 1.0f / std::sqrt(DistanceSquared));
        const float Cosine = std::max(0.0f, Dot(Card.Normal, Direction));
        if (Cosine > 0.0f)
        {
            const bool Occluded = TraceSdfOpaque(Origin, Direction, std::max(0.02f, std::sqrt(DistanceSquared) - 0.04f),
                                                 Clipmap, Vehicle);
            Accumulated = Add(Accumulated,
                              Multiply(Multiply(Card.Albedo, Input.PointIntensity), Cosine * (Occluded ? 0.0f : 1.0f) /
                                                                           (4.0f * Pi * DistanceSquared * Pi)));
        }
    }
    return Accumulated;
}

} // namespace

Vector3 Add(Vector3 Left, Vector3 Right) noexcept
{
    return { Left.X + Right.X, Left.Y + Right.Y, Left.Z + Right.Z };
}

Vector3 Subtract(Vector3 Left, Vector3 Right) noexcept
{
    return { Left.X - Right.X, Left.Y - Right.Y, Left.Z - Right.Z };
}

Vector3 Multiply(Vector3 Value, float Scalar) noexcept
{
    return { Value.X * Scalar, Value.Y * Scalar, Value.Z * Scalar };
}

float Dot(Vector3 Left, Vector3 Right) noexcept
{
    return Left.X * Right.X + Left.Y * Right.Y + Left.Z * Right.Z;
}

float Length(Vector3 Value) noexcept
{
    return std::sqrt(Dot(Value, Value));
}

Vector3 Normalize(Vector3 Value) noexcept
{
    const float Magnitude = Length(Value);
    return Magnitude > 1.0e-7f ? Multiply(Value, 1.0f / Magnitude) : Vector3 { 0.0f, 1.0f, 0.0f };
}

Vector3 Cross(Vector3 Left, Vector3 Right) noexcept
{
    return {
        Left.Y * Right.Z - Left.Z * Right.Y,
        Left.Z * Right.X - Left.X * Right.Z,
        Left.X * Right.Y - Left.Y * Right.X,
    };
}

Radiance3 Add(Radiance3 Left, Radiance3 Right) noexcept
{
    return { Left.R + Right.R, Left.G + Right.G, Left.B + Right.B };
}

Radiance3 Multiply(Radiance3 Value, float Scalar) noexcept
{
    return { Value.R * Scalar, Value.G * Scalar, Value.B * Scalar };
}

Radiance3 Multiply(Radiance3 Left, Radiance3 Right) noexcept
{
    return { Left.R * Right.R, Left.G * Right.G, Left.B * Right.B };
}

bool ClipmapLevel::Contains(Vector3 WorldPosition) const noexcept
{
    const float MaximumX = Minimum.X + VoxelSpacing * static_cast<float>(EdgeSamples - 1u);
    const float MaximumY = Minimum.Y + VoxelSpacing * static_cast<float>(EdgeSamples - 1u);
    const float MaximumZ = Minimum.Z + VoxelSpacing * static_cast<float>(EdgeSamples - 1u);
    return WorldPosition.X >= Minimum.X && WorldPosition.X <= MaximumX &&
           WorldPosition.Y >= Minimum.Y && WorldPosition.Y <= MaximumY &&
           WorldPosition.Z >= Minimum.Z && WorldPosition.Z <= MaximumZ;
}

float ClipmapLevel::Sample(Vector3 WorldPosition) const noexcept
{
    if (EdgeSamples < 2u || SignedDistance.empty())
    {
        return std::numeric_limits<float>::infinity();
    }
    return EvaluateTrilinear(*this, WorldPosition);
}

void StaticDistanceClipmap::Bake(Vector3 Anchor)
{
    static constexpr std::array<float, 3u> HalfExtents { 4.0f, 8.0f, 16.0f };
    static constexpr uint32_t EdgeSamples = 128u;
    Levels.clear();
    Levels.reserve(HalfExtents.size());
    for (const float HalfExtent : HalfExtents)
    {
        ClipmapLevel Level;
        Level.EdgeSamples = EdgeSamples;
        Level.VoxelSpacing = (2.0f * HalfExtent) / static_cast<float>(EdgeSamples - 1u);
        Level.Minimum = { Anchor.X - HalfExtent, Anchor.Y - HalfExtent, Anchor.Z - HalfExtent };
        Level.SignedDistance.resize(static_cast<size_t>(EdgeSamples) * EdgeSamples * EdgeSamples);
        for (uint32_t Z = 0u; Z < EdgeSamples; ++Z)
        {
            for (uint32_t Y = 0u; Y < EdgeSamples; ++Y)
            {
                for (uint32_t X = 0u; X < EdgeSamples; ++X)
                {
                    const Vector3 Position {
                        Level.Minimum.X + static_cast<float>(X) * Level.VoxelSpacing,
                        Level.Minimum.Y + static_cast<float>(Y) * Level.VoxelSpacing,
                        Level.Minimum.Z + static_cast<float>(Z) * Level.VoxelSpacing,
                    };
                    Level.SignedDistance[Flatten(X, Y, Z, EdgeSamples)] = EvaluateStaticDistance(Position);
                }
            }
        }
        Levels.push_back(std::move(Level));
    }
}

float StaticDistanceClipmap::Sample(Vector3 WorldPosition, uint32_t* OutLevel) const noexcept
{
    for (uint32_t Index = 0u; Index < Levels.size(); ++Index)
    {
        if (Levels[Index].Contains(WorldPosition))
        {
            if (OutLevel != nullptr)
            {
                *OutLevel = Index;
            }
            return Levels[Index].Sample(WorldPosition);
        }
    }
    if (OutLevel != nullptr)
    {
        *OutLevel = static_cast<uint32_t>(Levels.size());
    }
    return EvaluateStaticDistance(WorldPosition);
}

const std::vector<ClipmapLevel>& StaticDistanceClipmap::InspectLevels() const noexcept
{
    return Levels;
}

float EvaluateStaticDistance(Vector3 WorldPosition) noexcept
{
    float Distance = SignedBox(WorldPosition, { 0.0f, -0.16f, 0.15f }, { 4.6f, 0.16f, 4.25f }); // floor
    Distance = std::min(Distance, SignedBox(WorldPosition, { 0.0f, 1.55f, 3.90f }, { 4.6f, 1.75f, 0.16f })); // rear wall
    Distance = std::min(Distance, SignedBox(WorldPosition, { -4.45f, 1.55f, 0.15f }, { 0.16f, 1.75f, 4.25f })); // left wall
    Distance = std::min(Distance, SignedBox(WorldPosition, { 4.45f, 1.55f, 0.15f }, { 0.16f, 1.75f, 4.25f })); // right wall
    Distance = std::min(Distance, SignedBox(WorldPosition, { 0.0f, 3.20f, 0.15f }, { 4.6f, 0.10f, 4.25f })); // ceiling
    Distance = std::min(Distance, SignedBox(WorldPosition, { -1.85f, 0.60f, 1.55f }, { 0.42f, 0.60f, 0.42f })); // column
    Distance = std::min(Distance, SignedBox(WorldPosition, { 0.0f, 3.05f, -0.20f }, { 1.10f, 0.08f, 0.62f })); // area emitter housing
    return Distance;
}

float EvaluateVehicleDistance(Vector3 WorldPosition, const VehiclePlacement& Vehicle) noexcept
{
    const Vector3 Local = RotateYawInverse(WorldPosition, Vehicle);
    float Distance = SignedBox(Local, { 0.0f, 0.10f, 0.0f }, { 1.35f, 0.42f, 0.62f });
    Distance = std::min(Distance, SignedBox(Local, { -0.10f, 0.58f, 0.0f }, { 0.70f, 0.35f, 0.54f }));
    Distance = std::min(Distance, SignedBox(Local, { 0.82f, 0.34f, 0.0f }, { 0.38f, 0.24f, 0.52f }));
    for (const float X : { -0.88f, 0.88f })
    {
        for (const float Z : { -0.66f, 0.66f })
        {
            Distance = std::min(Distance, SignedCylinderX(Local, { X, -0.22f, Z }, 0.30f, 0.13f));
        }
    }
    return Distance;
}

float EvaluateHybridDistance(Vector3 WorldPosition, const StaticDistanceClipmap& Clipmap,
                             const VehiclePlacement& Vehicle, uint32_t* OutLevel) noexcept
{
    const float StaticDistance = Clipmap.Sample(WorldPosition, OutLevel);
    return std::min(StaticDistance, EvaluateVehicleDistance(WorldPosition, Vehicle));
}

Vector3 EvaluateHybridNormal(Vector3 WorldPosition, const StaticDistanceClipmap& Clipmap,
                             const VehiclePlacement& Vehicle) noexcept
{
    const float Epsilon = 0.008f;
    const float Dx = EvaluateHybridDistance(Add(WorldPosition, { Epsilon, 0.0f, 0.0f }), Clipmap, Vehicle) -
                     EvaluateHybridDistance(Add(WorldPosition, { -Epsilon, 0.0f, 0.0f }), Clipmap, Vehicle);
    const float Dy = EvaluateHybridDistance(Add(WorldPosition, { 0.0f, Epsilon, 0.0f }), Clipmap, Vehicle) -
                     EvaluateHybridDistance(Add(WorldPosition, { 0.0f, -Epsilon, 0.0f }), Clipmap, Vehicle);
    const float Dz = EvaluateHybridDistance(Add(WorldPosition, { 0.0f, 0.0f, Epsilon }), Clipmap, Vehicle) -
                     EvaluateHybridDistance(Add(WorldPosition, { 0.0f, 0.0f, -Epsilon }), Clipmap, Vehicle);
    return Normalize({ Dx, Dy, Dz });
}

Radiance3 EvaluateSurfaceAlbedo(Vector3 WorldPosition, const VehiclePlacement& Vehicle) noexcept
{
    const float VehicleDistance = EvaluateVehicleDistance(WorldPosition, Vehicle);
    if (VehicleDistance < 0.035f)
    {
        const Vector3 Local = RotateYawInverse(WorldPosition, Vehicle);
        return std::fabs(Local.Y + 0.22f) < 0.07f ? Radiance3 { 0.025f, 0.027f, 0.031f } : Radiance3 { 0.42f, 0.022f, 0.018f };
    }
    if (WorldPosition.Z > 3.70f)
    {
        return { 0.26f, 0.35f, 0.53f };
    }
    if (WorldPosition.X < -4.25f)
    {
        return { 0.48f, 0.18f, 0.12f };
    }
    if (WorldPosition.X > 4.25f)
    {
        return { 0.18f, 0.38f, 0.22f };
    }
    return { 0.42f, 0.40f, 0.36f };
}

void SurfaceCardCache::Initialize()
{
    Cards = {
        // Four cards replace one floor-wide record so a moving vehicle cannot shadow the only floor injection sample.
        { { -2.15f, 0.01f, -1.65f }, { 0.0f, 1.0f, 0.0f }, { 1.0f, 0.0f, 0.0f }, { 0.0f, 0.0f, 1.0f }, 1.65f, 1.55f, { 0.42f, 0.40f, 0.36f }, {}, 1u, false, false },
        { {  2.15f, 0.01f, -1.65f }, { 0.0f, 1.0f, 0.0f }, { 1.0f, 0.0f, 0.0f }, { 0.0f, 0.0f, 1.0f }, 1.65f, 1.55f, { 0.42f, 0.40f, 0.36f }, {}, 2u, false, false },
        { { -2.15f, 0.01f,  1.95f }, { 0.0f, 1.0f, 0.0f }, { 1.0f, 0.0f, 0.0f }, { 0.0f, 0.0f, 1.0f }, 1.65f, 1.55f, { 0.42f, 0.40f, 0.36f }, {}, 3u, false, false },
        { {  2.15f, 0.01f,  1.95f }, { 0.0f, 1.0f, 0.0f }, { 1.0f, 0.0f, 0.0f }, { 0.0f, 0.0f, 1.0f }, 1.65f, 1.55f, { 0.42f, 0.40f, 0.36f }, {}, 4u, false, false },
        { { 0.0f, 1.55f, 3.72f }, { 0.0f, 0.0f, -1.0f }, { 1.0f, 0.0f, 0.0f }, { 0.0f, 1.0f, 0.0f }, 4.20f, 1.45f, { 0.26f, 0.35f, 0.53f }, {}, 5u, false, false },
        { { -4.28f, 1.55f, 0.15f }, { 1.0f, 0.0f, 0.0f }, { 0.0f, 0.0f, 1.0f }, { 0.0f, 1.0f, 0.0f }, 3.95f, 1.45f, { 0.48f, 0.18f, 0.12f }, {}, 6u, false, false },
        { { 4.28f, 1.55f, 0.15f }, { -1.0f, 0.0f, 0.0f }, { 0.0f, 0.0f, -1.0f }, { 0.0f, 1.0f, 0.0f }, 3.95f, 1.45f, { 0.18f, 0.38f, 0.22f }, {}, 7u, false, false },
        { { 0.0f, 2.95f, -0.20f }, { 0.0f, -1.0f, 0.0f }, { 1.0f, 0.0f, 0.0f }, { 0.0f, 0.0f, 1.0f }, 1.10f, 0.62f, { 1.0f, 0.45f, 0.12f }, {}, 8u, true, false },
        { {}, { 0.0f, 1.0f, 0.0f }, { 1.0f, 0.0f, 0.0f }, { 0.0f, 0.0f, 1.0f }, 1.25f, 0.50f, { 0.42f, 0.022f, 0.018f }, {}, 9u, false, true },
    };
}

void SurfaceCardCache::Inject(const IlluminationInput& Input, const VehiclePlacement& Vehicle,
                              const StaticDistanceClipmap& Clipmap)
{
    if (Cards.empty())
    {
        Initialize();
    }
    for (SurfaceCard& Card : Cards)
    {
        if (Card.LocalVehicle)
        {
            Card.Centre = RotateYaw({ 0.0f, 0.56f, 0.0f }, Vehicle);
            Card.AxisU = Normalize(Subtract(RotateYaw({ 1.0f, 0.0f, 0.0f }, Vehicle), Vehicle.Centre));
            Card.AxisV = { 0.0f, 0.0f, 1.0f };
            Card.Normal = Normalize(Cross(Card.AxisV, Card.AxisU));
        }
        Card.Radiance = DirectCardRadiance(Card, Input, Clipmap, Vehicle);
    }
}

Radiance3 SurfaceCardCache::Sample(Vector3 WorldPosition, Vector3 IncomingDirection) const noexcept
{
    Radiance3 Radiance {};
    float NearestDistance = std::numeric_limits<float>::infinity();
    for (const SurfaceCard& Card : Cards)
    {
        const Vector3 Difference = Subtract(WorldPosition, Card.Centre);
        const float U = Dot(Difference, Card.AxisU);
        const float V = Dot(Difference, Card.AxisV);
        const float PlaneDistance = std::fabs(Dot(Difference, Card.Normal));
        if (std::fabs(U) > Card.HalfWidth + 0.12f || std::fabs(V) > Card.HalfHeight + 0.12f || PlaneDistance > 0.25f)
        {
            continue;
        }
        if (PlaneDistance < NearestDistance)
        {
            NearestDistance = PlaneDistance;
            const float Outgoing = std::max(0.0f, Dot(Card.Normal, Multiply(IncomingDirection, -1.0f)));
            Radiance = Multiply(Card.Radiance, Outgoing);
        }
    }
    return Radiance;
}

const std::vector<SurfaceCard>& SurfaceCardCache::InspectCards() const noexcept
{
    return Cards;
}

PenumbraTrace TraceSdfPenumbra(Vector3 Origin, Vector3 Direction, float MaximumDistance, float SourceAngularRadius,
                                const StaticDistanceClipmap& Clipmap, const VehiclePlacement& Vehicle) noexcept
{
    PenumbraTrace Result;
    const Vector3 UnitDirection = Normalize(Direction);
    float Distance = 0.025f;
    for (uint32_t Step = 0u; Step < 192u && Distance < MaximumDistance; ++Step)
    {
        const float FieldDistance = EvaluateHybridDistance(Add(Origin, Multiply(UnitDirection, Distance)), Clipmap, Vehicle);
        const float ConeRadius = std::max(0.012f, Distance * std::tan(SourceAngularRadius));
        const float Ratio = Clamp(FieldDistance / ConeRadius, 0.0f, 1.0f);
        // Cubic easing removes discrete visibility plateaus from a low-frequency distance volume without a display filter.
        const float SmoothRatio = Ratio * Ratio * (3.0f - 2.0f * Ratio);
        Result.Visibility = std::min(Result.Visibility, SmoothRatio);
        Result.Steps = Step + 1u;
        if (FieldDistance < 0.003f)
        {
            Result.Visibility = 0.0f;
            break;
        }
        Distance += std::max(0.008f, std::fabs(FieldDistance) * 0.38f);
    }
    return Result;
}

} // namespace Frontier::DistanceFieldSpace
